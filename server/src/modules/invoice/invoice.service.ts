import crypto from 'crypto';
import prisma from '../../db';
import { Logger } from '../../utils/logger';
import { Prisma } from '@prisma/client';
import {
  InvoiceRecord,
  InvoiceItemSnapshot,
  GenerateInvoicePayload,
  VerifyInvoiceResult,
  PublicInvoiceVerificationResult,
  Gstr1ExportRow,
  Gstr1FilterQuery
} from './invoice.types';
import { isPublicInvoiceId, toPublicInvoiceVerification } from './invoice-public';

const normalizePem = (key?: string) => key?.replace(/\\n/g, '\n');
const activeInvoiceKeyVersion = (process.env.INVOICE_ACTIVE_KEY_VERSION || 'v1').toLowerCase();
const configuredPublicKeys: Record<string, string> = {};
const configuredPrivateKeys: Record<string, string> = {};
for (const version of ['v1', 'v2']) {
  const suffix = version.toUpperCase();
  const publicKey = normalizePem(process.env[`INVOICE_PUBLIC_KEY_${suffix}`]);
  const privateKey = normalizePem(process.env[`INVOICE_PRIVATE_KEY_${suffix}`]);
  if (publicKey) configuredPublicKeys[version] = publicKey;
  if (privateKey) configuredPrivateKeys[version] = privateKey;
}
// Preserve the original key variable names as the v1 migration path.
const legacyConfiguredPublicKey = normalizePem(process.env.INVOICE_SIGNING_PUBLIC_KEY);
const legacyConfiguredPrivateKey = normalizePem(process.env.INVOICE_SIGNING_PRIVATE_KEY);
if (legacyConfiguredPublicKey) configuredPublicKeys.v1 ||= legacyConfiguredPublicKey;
if (legacyConfiguredPrivateKey) configuredPrivateKeys.v1 ||= legacyConfiguredPrivateKey;
const legacyInvoiceSignatureSalt = process.env.INVOICE_SALT || 'sharvin_gst_secure_salt_2026';
if (!/^[a-z0-9_-]+$/.test(activeInvoiceKeyVersion)) {
  throw new Error('INVOICE_ACTIVE_KEY_VERSION contains invalid characters.');
}
const hasConfiguredKeys = Object.keys(configuredPrivateKeys).length > 0 || Object.keys(configuredPublicKeys).length > 0;
if (!hasConfiguredKeys) {
  const generatedPair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
  configuredPrivateKeys.v1 = generatedPair.privateKey;
  configuredPublicKeys.v1 = generatedPair.publicKey;
}
if (Boolean(configuredPrivateKeys[activeInvoiceKeyVersion]) !== Boolean(configuredPublicKeys[activeInvoiceKeyVersion])) {
  throw new Error(`Invoice signing keys for active version ${activeInvoiceKeyVersion} must be configured as a pair.`);
}
if (!configuredPrivateKeys[activeInvoiceKeyVersion]) {
  throw new Error(`No active invoice private key is configured for version ${activeInvoiceKeyVersion}.`);
}

// Default HSN lookup mapping for staples & FMCG
const HSN_CODE_MAP: Record<string, { hsn: string; gstRate: number }> = {
  'atta': { hsn: '1901', gstRate: 5 },
  'aashirvaad': { hsn: '1901', gstRate: 5 },
  'flour': { hsn: '1901', gstRate: 5 },
  'rice': { hsn: '1006', gstRate: 5 },
  'basmati': { hsn: '1006', gstRate: 5 },
  'oil': { hsn: '1512', gstRate: 5 },
  'sunflower': { hsn: '1512', gstRate: 5 },
  'fortune': { hsn: '1512', gstRate: 5 },
  'salt': { hsn: '2501', gstRate: 0 },
  'tata salt': { hsn: '2501', gstRate: 0 },
  'sugar': { hsn: '1701', gstRate: 5 },
  'dal': { hsn: '0713', gstRate: 5 },
  'pulses': { hsn: '0713', gstRate: 5 },
  'default': { hsn: '2106', gstRate: 5 },
};

export class InvoiceService {
  static async verifyPublicInvoice(invoiceId: string): Promise<PublicInvoiceVerificationResult | null> {
    if (!isPublicInvoiceId(invoiceId)) return null;
    const exists = await prisma.invoice.findUnique({ where: { id: invoiceId }, select: { id: true } });
    if (!exists) return null;
    return toPublicInvoiceVerification(await this.verifyInvoiceIntegrity(invoiceId));
  }

  /**
   * Helper to derive HSN code and GST rate from product name.
   */
  static getHsnAndGstRate(productName: string): { hsn: string; gstRate: number } {
    const lower = productName.toLowerCase();
    for (const [keyword, data] of Object.entries(HSN_CODE_MAP)) {
      if (lower.includes(keyword)) {
        return data;
      }
    }
    return HSN_CODE_MAP.default;
  }

  /**
   * Helper to convert numbers to Indian Rupees in words.
   */
  static numberToWords(num: number): string {
    const a = [
      '', 'One ', 'Two ', 'Three ', 'Four ', 'Five ', 'Six ', 'Seven ', 'Eight ', 'Nine ',
      'Ten ', 'Eleven ', 'Twelve ', 'Thirteen ', 'Fourteen ', 'Fifteen ', 'Sixteen ',
      'Seventeen ', 'Eighteen ', 'Nineteen '
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const formatUnderThousand = (n: number): string => {
      let str = '';
      if (n > 99) {
        str += a[Math.floor(n / 100)] + 'Hundred ';
        n %= 100;
      }
      if (n > 19) {
        str += b[Math.floor(n / 10)] + ' ' + a[n % 10];
      } else if (n > 0) {
        str += a[n];
      }
      return str;
    };

    const whole = Math.floor(num);
    const paise = Math.round((num - whole) * 100);

    if (whole === 0) return 'Zero Rupees Only';

    const crore = Math.floor(whole / 10000000);
    const lakh = Math.floor((whole % 10000000) / 100000);
    const thousand = Math.floor((whole % 100000) / 1000);
    const remainder = whole % 1000;

    let res = '';
    if (crore > 0) res += formatUnderThousand(crore) + 'Crore ';
    if (lakh > 0) res += formatUnderThousand(lakh) + 'Lakh ';
    if (thousand > 0) res += formatUnderThousand(thousand) + 'Thousand ';
    if (remainder > 0) res += formatUnderThousand(remainder);

    res = res.trim() + ' Rupees';
    if (paise > 0) {
      res += ' and ' + formatUnderThousand(paise).trim() + ' Paise';
    }
    return res + ' Only';
  }

  /**
   * RSA-SHA256 sign the canonical invoice payload. In production, configure a
   * persistent key pair so invoices remain verifiable across server restarts.
   */
  static computeSignatureHash(payload: {
    invoiceNumber: string;
    orderId: string;
    taxableAmount: number;
    totalInvoiceAmount: number;
    wholesalerGstin: string;
    retailerGstin: string;
    issuedAt: string;
  }, keyVersion: string = activeInvoiceKeyVersion): string {
    const canonicalString = [
      payload.invoiceNumber,
      payload.orderId,
      payload.taxableAmount.toFixed(2),
      payload.totalInvoiceAmount.toFixed(2),
      payload.wholesalerGstin,
      payload.retailerGstin,
      payload.issuedAt,
    ].join('|');
    const privateKey = configuredPrivateKeys[keyVersion];
    if (!privateKey) throw new Error(`No invoice private key is configured for version ${keyVersion}.`);
    return crypto.sign('RSA-SHA256', Buffer.from(canonicalString, 'utf8'), privateKey).toString('base64');
  }

  /**
   * Build dynamic signed QR code data string and verification URL.
   */
  static buildQrCodeData(invoice: {
    id: string;
    invoiceNumber: string;
    orderNumber: string;
    wholesalerGstin: string;
    retailerGstin: string;
    totalInvoiceAmount: number;
    issuedAt: string;
    signatureHash: string;
  }): { qrCodeData: string; verificationUrl: string } {
    const verificationUrl = `/verify/invoice/${invoice.id}`;
    const qrPayload = JSON.stringify({
      v: '1.0',
      inv: invoice.invoiceNumber,
      po: invoice.orderNumber,
      sellerGst: invoice.wholesalerGstin,
      buyerGst: invoice.retailerGstin,
      total: invoice.totalInvoiceAmount,
      date: invoice.issuedAt,
      sig: invoice.signatureHash.slice(0, 16),
      url: verificationUrl,
    });

    return {
      qrCodeData: qrPayload,
      verificationUrl,
    };
  }

  /**
   * Map a persisted `invoices` row to the API-facing InvoiceRecord shape.
   */
  static mapRowToRecord(dbInv: Prisma.InvoiceGetPayload<object>): InvoiceRecord {
    return {
      id: dbInv.id,
      invoiceNumber: dbInv.invoiceNumber,
      orderId: dbInv.orderId,
      orderNumber: dbInv.orderNumber,
      wholesalerId: dbInv.wholesalerId,
      wholesalerName: dbInv.wholesalerName,
      wholesalerGstin: dbInv.wholesalerGstin,
      wholesalerState: dbInv.wholesalerState,
      wholesalerAddress: dbInv.wholesalerAddress,
      retailerId: dbInv.retailerId,
      retailerName: dbInv.retailerName,
      retailerGstin: dbInv.retailerGstin,
      retailerState: dbInv.retailerState,
      retailerAddress: dbInv.retailerAddress,
      placeOfSupply: dbInv.retailerState,
      isInterState: dbInv.isInterState,
      taxableAmount: Number(dbInv.taxableAmount),
      cgstAmount: Number(dbInv.cgstAmount),
      sgstAmount: Number(dbInv.sgstAmount),
      igstAmount: Number(dbInv.igstAmount),
      totalTaxAmount: Number(dbInv.totalTaxAmount),
      totalInvoiceAmount: Number(dbInv.totalInvoiceAmount),
      totalAmountInWords: InvoiceService.numberToWords(Number(dbInv.totalInvoiceAmount)),
      itemsSnapshot: dbInv.itemsSnapshot as unknown as InvoiceItemSnapshot[],
      signatureHash: dbInv.signatureHash,
      qrCodeData: dbInv.qrCodeData,
      verificationUrl: `/verify/invoice/${dbInv.id}`,
      status: dbInv.status as 'issued' | 'cancelled',
      issuedAt: dbInv.issuedAt.toISOString(),
      createdAt: dbInv.createdAt.toISOString(),
    };
  }

  /**
   * Auto-generate an immutable B2B GST Tax Invoice for an order.
   */
  static async autoGenerateInvoiceForOrder(
    payload: GenerateInvoicePayload
  ): Promise<InvoiceRecord> {
    const { orderId } = payload;

    // 1. Check if invoice already exists for this order (persisted, unique per order)
    const existing = await prisma.invoice.findUnique({
      where: { orderId },
    });
    if (existing) {
      return InvoiceService.mapRowToRecord(existing);
    }

    // 2. Fetch order metadata from DB or fallback
    let orderNumber = `PO-${orderId.slice(-6).toUpperCase()}`;
    let wholesalerId = payload.wholesalerId || 'usr-wholesaler-demo';
    let retailerId = payload.retailerId || 'usr-retailer-demo';
    let wholesalerName = 'Kailash Grains & Pulses Wholesale Pvt Ltd';
    let wholesalerGstin = '07AAAAA0000A1Z5';
    let wholesalerState = payload.wholesalerState || 'Delhi';
    let wholesalerAddress = 'Plot 4B, Naya Bazar Mandi, Old Delhi, Delhi - 110006';
    let wholesalerPan = 'AAAAA0000A';

    let retailerName = 'Gupta Kirana Store';
    let retailerGstin = '07BBBBB1111B1Z9';
    let retailerState = payload.retailerState || 'Delhi';
    let retailerAddress = 'Shop 12, Main Market, Karol Bagh, New Delhi - 110005';
    let retailerPan = 'BBBBB1111B';

    let rawItems: Array<{
      productId: string;
      productName: string;
      sku: string;
      quantity: number;
      unit: string;
      unitPrice: number;
      hsnCode?: string;
      gstRate?: number;
    }> = [];

    try {
      const dbOrder = await prisma.order.findFirst({
        where: { OR: [{ id: orderId }, { orderNumber: orderId }] },
        include: {
          retailer: {
            include: {
              retailerProfile: true,
              addresses: true,
            },
          },
          wholesaler: {
            include: {
              wholesalerProfile: true,
              addresses: true,
            },
          },
          orderItems: {
            include: {
              product: true,
            },
          },
        },
      });

      if (dbOrder) {
        orderNumber = dbOrder.orderNumber;
        wholesalerId = dbOrder.wholesalerId;
        retailerId = dbOrder.retailerId;

        wholesalerName = dbOrder.wholesaler.businessName || dbOrder.wholesaler.fullName || wholesalerName;
        wholesalerGstin = dbOrder.wholesaler.wholesalerProfile?.gstNumber || wholesalerGstin;
        wholesalerPan = dbOrder.wholesaler.wholesalerProfile?.panNumber || wholesalerPan;
        if (dbOrder.wholesaler.addresses?.[0]) {
          wholesalerAddress = `${dbOrder.wholesaler.addresses[0].addressLine1}, ${dbOrder.wholesaler.addresses[0].city}, ${dbOrder.wholesaler.addresses[0].state} - ${dbOrder.wholesaler.addresses[0].postalCode}`;
          wholesalerState = dbOrder.wholesaler.addresses[0].state || wholesalerState;
        }

        retailerName = dbOrder.retailer.businessName || dbOrder.retailer.fullName || retailerName;
        retailerGstin = dbOrder.retailer.retailerProfile?.gstNumber || retailerGstin;
        retailerPan = dbOrder.retailer.retailerProfile?.panNumber || retailerPan;
        if (dbOrder.retailer.addresses?.[0]) {
          retailerAddress = `${dbOrder.retailer.addresses[0].addressLine1}, ${dbOrder.retailer.addresses[0].city}, ${dbOrder.retailer.addresses[0].state} - ${dbOrder.retailer.addresses[0].postalCode}`;
          retailerState = dbOrder.retailer.addresses[0].state || retailerState;
        }

        rawItems = dbOrder.orderItems.map((item) => ({
          productId: item.productId,
          productName: item.product.productName,
          sku: item.product.manufacturerBarcode || item.product.systemGeneratedBarcode || `SKU-${item.productId.slice(-6)}`,
          quantity: item.quantity,
          unit: item.product.unitOfMeasure || 'Bags',
          unitPrice: item.finalUnitPrice ? Number(item.finalUnitPrice) : (item.quotedUnitPrice ? Number(item.quotedUnitPrice) : 400),
        }));
      }
    } catch (e: any) {
      Logger.warn(`[InvoiceService] DB lookup fell back for order: ${orderId}`);
    }

    if (rawItems.length === 0) {
      if (payload.items && payload.items.length > 0) {
        rawItems = payload.items.map((i) => ({
          productId: i.productId,
          productName: i.productName,
          sku: i.sku || 'SKU-GEN',
          quantity: i.quantity,
          unit: i.unit || 'Units',
          unitPrice: i.unitPrice,
          hsnCode: i.hsnCode,
          gstRate: i.gstRate,
        }));
      } else {
        // High-fidelity fallback items matching SharVin demo
        rawItems = [
          {
            productId: 'prod-atta-10kg',
            productName: 'Aashirvaad Shudh Chakki Atta 10kg',
            sku: 'ASH-ATTA-10K',
            quantity: 25,
            unit: 'Bags',
            unitPrice: 400.00,
          },
          {
            productId: 'prod-rice-5kg',
            productName: 'India Gate Basmati Feast 5kg',
            sku: 'IG-BAS-05K',
            quantity: 15,
            unit: 'Bags',
            unitPrice: 440.00,
          },
        ];
      }
    }

    // 3. GST Calculation Logic (Intra-State vs Inter-State)
    const isInterState = wholesalerState.trim().toLowerCase() !== retailerState.trim().toLowerCase();

    let totalTaxable = new Prisma.Decimal(0);
    let totalCgst = new Prisma.Decimal(0);
    let totalSgst = new Prisma.Decimal(0);
    let totalIgst = new Prisma.Decimal(0);
  
    const itemsSnapshot: InvoiceItemSnapshot[] = rawItems.map((item, index) => {
      const hsnData = InvoiceService.getHsnAndGstRate(item.productName);
      const hsnCode = item.hsnCode || hsnData.hsn;
      const gstRate = item.gstRate !== undefined ? item.gstRate : hsnData.gstRate;
  
      const taxableAmount = new Prisma.Decimal(item.quantity).mul(item.unitPrice);
      totalTaxable = totalTaxable.plus(taxableAmount);
  
      let cgstRate = 0;
      let cgstAmount = new Prisma.Decimal(0);
      let sgstRate = 0;
      let sgstAmount = new Prisma.Decimal(0);
      let igstRate = 0;
      let igstAmount = new Prisma.Decimal(0);
  
      if (isInterState) {
        igstRate = gstRate;
        igstAmount = taxableAmount.mul(igstRate).div(100);
        totalIgst = totalIgst.plus(igstAmount);
      } else {
        cgstRate = gstRate / 2;
        cgstAmount = taxableAmount.mul(cgstRate).div(100);
        sgstRate = gstRate / 2;
        sgstAmount = taxableAmount.mul(sgstRate).div(100);
        totalCgst = totalCgst.plus(cgstAmount);
        totalSgst = totalSgst.plus(sgstAmount);
      }
  
      const totalLineAmount = taxableAmount.plus(cgstAmount).plus(sgstAmount).plus(igstAmount);
  
      return {
        itemId: `item-inv-${index + 1}`,
        productId: item.productId,
        productName: item.productName,
        sku: item.sku,
        hsnCode,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        taxableAmount: taxableAmount.toNumber(),
        gstRate,
        cgstRate,
        cgstAmount: cgstAmount.toNumber(),
        sgstRate,
        sgstAmount: sgstAmount.toNumber(),
        igstRate,
        igstAmount: igstAmount.toNumber(),
        totalLineAmount: totalLineAmount.toNumber(),
      };
    });

    const totalTaxAmount = totalCgst.plus(totalSgst).plus(totalIgst);
    const totalInvoiceAmount = totalTaxable.plus(totalTaxAmount);
  
    // 4. Generate Standardized Tax Invoice Number (uniqueness is DB-enforced)
    const invoiceNumber = await InvoiceService.nextInvoiceNumber();
    const invoiceId = `inv-${crypto.randomUUID()}`;
    const issuedAt = new Date().toISOString();
  
    // 5. Compute SHA-256 Digital Signature
    const signatureHash = InvoiceService.computeSignatureHash({
      invoiceNumber,
      orderId,
      taxableAmount: totalTaxable.toNumber(),
      totalInvoiceAmount: totalInvoiceAmount.toNumber(),
      wholesalerGstin,
      retailerGstin,
      issuedAt,
    }, activeInvoiceKeyVersion);
  
    // 6. Generate QR Code Payload & Link
    const { qrCodeData } = InvoiceService.buildQrCodeData({
      id: invoiceId,
      invoiceNumber,
      orderNumber,
      wholesalerGstin,
      retailerGstin,
      totalInvoiceAmount: totalInvoiceAmount.toNumber(),
      issuedAt,
      signatureHash,
    });
  
    // 7. Persist to PostgreSQL (single source of truth; errors surface to the caller)
    let created;
    try {
      created = await prisma.invoice.create({
        data: {
          id: invoiceId,
          invoiceNumber,
          orderId,
          orderNumber,
          wholesalerId,
          wholesalerName,
          wholesalerGstin,
          wholesalerState,
          wholesalerAddress,
          retailerId,
          retailerName,
          retailerGstin,
          retailerState,
          retailerAddress,
          taxableAmount: totalTaxable,
          cgstAmount: totalCgst,
          sgstAmount: totalSgst,
          igstAmount: totalIgst,
          totalTaxAmount,
          totalInvoiceAmount,
          itemsSnapshot: itemsSnapshot as unknown as Prisma.InputJsonValue,
          signatureHash,
          keyVersion: activeInvoiceKeyVersion,
          qrCodeData,
          isInterState,
          status: 'issued',
          issuedAt: new Date(issuedAt),
        },
      });
    } catch (e: any) {
      // Concurrent generation for the same order: the unique orderId constraint returns
      // the already-persisted invoice instead of failing the request.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const concurrent = await prisma.invoice.findUnique({ where: { orderId } });
        if (concurrent) return InvoiceService.mapRowToRecord(concurrent);
      }
      throw e;
    }

    return InvoiceService.mapRowToRecord(created);
  }

  /**
   * Produce the next sequential invoice number: INV-<FY><serial>.
   * Reads the current max and lets the unique index reject any race.
   */
  static async nextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const latest = await prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { invoiceNumber: 'desc' },
      select: { invoiceNumber: true },
    });
    const nextSerial = latest ? parseInt(latest.invoiceNumber.slice(prefix.length), 10) + 1 : 1;
    return `${prefix}${String(nextSerial).padStart(4, '0')}`;
  }

  /**
   * Retrieve invoice by ID, Invoice Number, Order ID, or Order Number.
   * Backed strictly by the PostgreSQL `invoices` table.
   */
  static async getInvoiceById(identifier: string): Promise<InvoiceRecord | null> {
    // Unique-backed lookups first (index hits on id / invoice_number / order_id)
    const dbInv =
      (await prisma.invoice.findUnique({ where: { id: identifier } })) ??
      (await prisma.invoice.findUnique({ where: { invoiceNumber: identifier } })) ??
      (await prisma.invoice.findUnique({ where: { orderId: identifier } })) ??
      (await prisma.invoice.findFirst({ where: { orderNumber: identifier } }));

    return dbInv ? InvoiceService.mapRowToRecord(dbInv) : null;
  }

  /**
   * Retrieve invoice by Order ID (unique-backed index hit).
   */
  static async getInvoiceByOrderId(orderId: string): Promise<InvoiceRecord | null> {
    const dbInv = await prisma.invoice.findUnique({ where: { orderId } });
    return dbInv ? InvoiceService.mapRowToRecord(dbInv) : null;
  }

  /**
   * Cryptographic verification to detect if invoice payload has been altered.
   */
  static async verifyInvoiceIntegrity(
    invoiceId: string,
    simulatedTamperedPayload?: {
      taxableAmount?: number;
      totalInvoiceAmount?: number;
      wholesalerGstin?: string;
      retailerGstin?: string;
    }
  ): Promise<VerifyInvoiceResult> {
    const invoice = await this.getInvoiceById(invoiceId);
    if (!invoice) {
      return {
        authentic: false,
        invoiceId,
        invoiceNumber: 'UNKNOWN',
        orderNumber: 'UNKNOWN',
        verifiedAt: new Date().toISOString(),
        signatureHash: '',
        storedSignatureHash: '',
        isTampered: true,
        message: 'Invoice not found in authentic government-compliant records.',
      };
    }
    const keyMetadata = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      select: { keyVersion: true },
    });
    const keyVersion = keyMetadata?.keyVersion || 'v1';

    // Determine payload to re-hash
    const taxableAmount = simulatedTamperedPayload?.taxableAmount !== undefined
      ? simulatedTamperedPayload.taxableAmount
      : invoice.taxableAmount;

    const totalInvoiceAmount = simulatedTamperedPayload?.totalInvoiceAmount !== undefined
      ? simulatedTamperedPayload.totalInvoiceAmount
      : invoice.totalInvoiceAmount;

    const wholesalerGstin = simulatedTamperedPayload?.wholesalerGstin || invoice.wholesalerGstin;
    const retailerGstin = simulatedTamperedPayload?.retailerGstin || invoice.retailerGstin;

    const signaturePayload = {
      invoiceNumber: invoice.invoiceNumber,
      orderId: invoice.orderId,
      taxableAmount,
      totalInvoiceAmount,
      wholesalerGstin,
      retailerGstin,
      issuedAt: invoice.issuedAt,
    };
    const canonicalString = [
      signaturePayload.invoiceNumber,
      signaturePayload.orderId,
      signaturePayload.taxableAmount.toFixed(2),
      signaturePayload.totalInvoiceAmount.toFixed(2),
      signaturePayload.wholesalerGstin,
      signaturePayload.retailerGstin,
      signaturePayload.issuedAt,
    ].join('|');
    let isMatch = false;
    const publicKey = configuredPublicKeys[keyVersion];
    if (publicKey) {
      try {
        isMatch = crypto.verify(
          'RSA-SHA256',
          Buffer.from(canonicalString, 'utf8'),
          publicKey,
          Buffer.from(invoice.signatureHash, 'base64')
        );
      } catch {
        isMatch = false;
      }
    }
    // Continue verifying invoices signed before the RSA migration.
    if (!isMatch && keyVersion === 'v1' && /^[a-f0-9]{64}$/i.test(invoice.signatureHash)) {
      const legacyHash = crypto.createHash('sha256').update(`${canonicalString}|${legacyInvoiceSignatureSalt}`).digest();
      const storedLegacyHash = Buffer.from(invoice.signatureHash, 'hex');
      isMatch = storedLegacyHash.length === legacyHash.length && crypto.timingSafeEqual(storedLegacyHash, legacyHash);
    }

    if (!isMatch) {
      return {
        authentic: false,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        orderNumber: invoice.orderNumber,
        verifiedAt: new Date().toISOString(),
        signatureHash: invoice.signatureHash,
        storedSignatureHash: invoice.signatureHash,
        isTampered: true,
        invoice,
        tamperDetails: 'Digital signature mismatch: Core tax, GSTIN, or total valuation fields have been altered.',
        message: 'Invalid/Tampered Invoice! Cryptographic verification failed.',
      };
    }

    return {
      authentic: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      orderNumber: invoice.orderNumber,
      verifiedAt: new Date().toISOString(),
      signatureHash: invoice.signatureHash,
      storedSignatureHash: invoice.signatureHash,
      isTampered: false,
      invoice,
      message: 'Authentic Official GST Tax Invoice. Digital signature verified and sealed.',
    };
  }

  /**
   * List invoices for Wholesaler or Retailer with date range filtering.
   */
  static async listInvoices(
    userId: string,
    userRole: string,
    filters?: Gstr1FilterQuery
  ): Promise<InvoiceRecord[]> {
    const tenantFilter = userRole === 'wholesaler' ? { wholesalerId: userId } : { retailerId: userId };
    const issuedAt: Prisma.DateTimeFilter = {};
    if (filters?.period) {
      const now = new Date();
      if (filters.period === 'current_month') {
        issuedAt.gte = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (filters.period === 'last_quarter') {
        issuedAt.gte = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      } else if (filters.period === 'custom' && filters.startDate) {
        const start = new Date(filters.startDate);
        const end = filters.endDate ? new Date(filters.endDate) : now;
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];
        issuedAt.gte = start;
        issuedAt.lte = end;
      }
    }
    const rows = await prisma.invoice.findMany({
      where: { ...tenantFilter, ...(Object.keys(issuedAt).length ? { issuedAt } : {}) },
      orderBy: { issuedAt: 'desc' },
    });
    return rows.map((row) => InvoiceService.mapRowToRecord(row));
  }

  /**
   * Generate CA GSTR-1 B2B Export rows.
   */
  static async generateGstr1Rows(
    wholesalerId: string,
    query: Gstr1FilterQuery
  ): Promise<Gstr1ExportRow[]> {
    const invoices = await this.listInvoices(wholesalerId, 'wholesaler', query);
    const rows: Gstr1ExportRow[] = [];

    for (const inv of invoices) {
      // Each invoice item rate represents a separate row in GSTR-1 Table 4
      for (const item of inv.itemsSnapshot) {
        rows.push({
          gstinRecipient: inv.retailerGstin,
          receiverName: inv.retailerName,
          invoiceNumber: inv.invoiceNumber,
          invoiceDate: new Date(inv.issuedAt).toLocaleDateString('en-GB'),
          invoiceValue: inv.totalInvoiceAmount,
          placeOfSupply: `${inv.placeOfSupply} (07)`,
          reverseCharge: 'N',
          applicablePercentageTax: 'Regular',
          invoiceType: 'Regular B2B',
          ratePercent: item.gstRate,
          taxableValue: item.taxableAmount,
          cessAmount: 0.00,
          cgstAmount: item.cgstAmount,
          sgstAmount: item.sgstAmount,
          igstAmount: item.igstAmount,
        });
      }
    }

    return rows;
  }

  /**
   * Format GSTR-1 rows into an RFC-4180 compliant CSV string.
   */
  static formatGstr1Csv(rows: Gstr1ExportRow[]): string {
    const headers = [
      'GSTIN/UIN of Recipient',
      'Receiver Name',
      'Invoice Number',
      'Invoice Date',
      'Invoice Value',
      'Place Of Supply',
      'Reverse Charge',
      'Applicable % of Tax Rate',
      'Invoice Type',
      'Rate (%)',
      'Taxable Value (₹)',
      'Cess Amount (₹)',
      'CGST Amount (₹)',
      'SGST Amount (₹)',
      'IGST Amount (₹)',
    ];

    const escapeCsv = (str: any) => {
      const val = str === null || str === undefined ? '' : String(str);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const lines = [
      '# SharVin B2B Commerce - Official GSTR-1 B2B Outward Supplies Tax Export',
      headers.map(escapeCsv).join(','),
      ...rows.map((r) => [
        escapeCsv(r.gstinRecipient),
        escapeCsv(r.receiverName),
        escapeCsv(r.invoiceNumber),
        escapeCsv(r.invoiceDate),
        escapeCsv(r.invoiceValue.toFixed(2)),
        escapeCsv(r.placeOfSupply),
        escapeCsv(r.reverseCharge),
        escapeCsv(r.applicablePercentageTax),
        escapeCsv(r.invoiceType),
        escapeCsv(r.ratePercent),
        escapeCsv(r.taxableValue.toFixed(2)),
        escapeCsv(r.cessAmount.toFixed(2)),
        escapeCsv(r.cgstAmount.toFixed(2)),
        escapeCsv(r.sgstAmount.toFixed(2)),
        escapeCsv(r.igstAmount.toFixed(2)),
      ].join(',')),
    ];

    return lines.join('\r\n');
  }

  /**
   * Format GSTR-1 rows into a clean XML Spreadsheet (compatible with all Microsoft Excel versions).
   */
  static formatGstr1ExcelXml(rows: Gstr1ExportRow[]): string {
    const escapeXml = (str: any) => {
      return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
    };

    const headerCols = [
      'GSTIN/UIN of Recipient', 'Receiver Name', 'Invoice Number', 'Invoice Date',
      'Invoice Value', 'Place Of Supply', 'Reverse Charge', 'Tax Rate %',
      'Invoice Type', 'Rate (%)', 'Taxable Value', 'Cess Amount',
      'CGST Amount', 'SGST Amount', 'IGST Amount'
    ];

    let tableRows = `
    <Row ss:StyleID="Header">
      ${headerCols.map((h) => `<Cell><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`).join('\n      ')}
    </Row>`;

    for (const r of rows) {
      tableRows += `
    <Row>
      <Cell><Data ss:Type="String">${escapeXml(r.gstinRecipient)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(r.receiverName)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(r.invoiceNumber)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(r.invoiceDate)}</Data></Cell>
      <Cell><Data ss:Type="Number">${r.invoiceValue}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(r.placeOfSupply)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(r.reverseCharge)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(r.applicablePercentageTax)}</Data></Cell>
      <Cell><Data ss:Type="String">${escapeXml(r.invoiceType)}</Data></Cell>
      <Cell><Data ss:Type="Number">${r.ratePercent}</Data></Cell>
      <Cell><Data ss:Type="Number">${r.taxableValue}</Data></Cell>
      <Cell><Data ss:Type="Number">${r.cessAmount}</Data></Cell>
      <Cell><Data ss:Type="Number">${r.cgstAmount}</Data></Cell>
      <Cell><Data ss:Type="Number">${r.sgstAmount}</Data></Cell>
      <Cell><Data ss:Type="Number">${r.igstAmount}</Data></Cell>
    </Row>`;
    }

    return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal">
   <Alignment ss:Vertical="Center"/>
   <Font ss:FontName="Calibri" ss:Size="11"/>
  </Style>
  <Style ss:ID="Header">
   <Font ss:FontName="Calibri" ss:Size="11" ss:Bold="1" ss:Color="#FFFFFF"/>
   <Interior ss:Color="#1A365D" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
  </Style>
 </Styles>
 <Worksheet ss:Name="GSTR-1 B2B Invoices">
  <Table>
   ${tableRows}
  </Table>
 </Worksheet>
</Workbook>`;
  }
}
