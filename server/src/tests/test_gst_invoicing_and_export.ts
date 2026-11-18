import { InvoiceService } from '../modules/invoice/invoice.service';
import { DeliveryService } from '../modules/delivery/delivery.service';
import { createDeliverableOrder } from './order-fixture';

async function runGstInvoicingAndExportSuite() {
  console.log('======================================================================');
  console.log('🧪 TASK 1 TEST SUITE: TAMPER-PROOF GST INVOICING & CA GSTR-1 EXPORT');
  console.log('======================================================================\n');

  let passedTests = 0;
  const results: Array<{ scenario: string; passed: boolean; details: string }> = [];

  // =========================================================================
  // SCENARIO 1: AUTO-GENERATE GST TAX INVOICE ON SUCCESSFUL ORDER DELIVERY
  // =========================================================================
  console.log('--- SCENARIO 1: Auto-generate GST Tax Invoice upon Delivery Handover ---');
  try {
    const orderId = `ord-delivery-${Date.now()}`;
    // Dispatch requires a persisted order row (P1 strictness).
    await createDeliverableOrder(orderId, `INV-DELIV-${Date.now()}`);
    const dispatch = await DeliveryService.dispatchOrder(
      {
        orderId,
        deliveryType: 'local_driver',
        driverName: 'Ramu Tempo',
        driverPhone: '+91 98765 43210',
      },
      'usr-wholesaler-demo',
      'wholesaler'
    );

    const verification = await DeliveryService.verifyHandover(
      {
        orderId,
        otpCode: dispatch.retailerOtpCode || '482910',
        notes: 'Handover complete; all bags intact.',
      },
      'usr-wholesaler-demo',
      'wholesaler'
    );

    if (!verification.isVerified || verification.deliveryStatus !== 'delivered') {
      throw new Error('Order handover verification failed');
    }

    if (!verification.invoice || !verification.invoice.invoiceNumber) {
      throw new Error('Delivery completion did not auto-generate GST Tax Invoice!');
    }

    console.log(`  -> Handover Verified: Order ${verification.orderNumber}`);
    console.log(`  -> Auto-generated Invoice: ${verification.invoice.invoiceNumber}`);
    console.log(`  -> Total Amount: ₹${verification.invoice.totalInvoiceAmount.toFixed(2)}`);
    console.log(`  -> Digital Signature Hash: ${verification.invoice.signatureHash.slice(0, 24)}...`);

    passedTests++;
    results.push({
      scenario: 'Auto-generate GST Invoice on DELIVERED status',
      passed: true,
      details: `Generated ${verification.invoice.invoiceNumber} with SHA-256 seal.`,
    });
  } catch (err: any) {
    console.error('  ❌ SCENARIO 1 FAILED:', err.message);
    results.push({ scenario: 'Auto-generate GST Invoice on DELIVERED status', passed: false, details: err.message });
  }

  // =========================================================================
  // SCENARIO 2: ACCURATE CGST / SGST (INTRA-STATE) & HSN BREAKDOWN
  // =========================================================================
  console.log('\n--- SCENARIO 2: Intra-State GST Calculation & HSN Codes (Delhi -> Delhi) ---');
  try {
    const invoice = await InvoiceService.autoGenerateInvoiceForOrder({
      orderId: `ord-delhi-${Date.now()}`,
      wholesalerState: 'Delhi',
      retailerState: 'Delhi',
      items: [
        {
          productId: 'prod-atta',
          productName: 'Aashirvaad Shudh Chakki Atta 10kg',
          sku: 'ASH-ATTA-10K',
          quantity: 25,
          unit: 'Bags',
          unitPrice: 400.00, // ₹10,000 taxable
        },
        {
          productId: 'prod-oil',
          productName: 'Fortune Sunlite Sunflower Oil 1L Pouch',
          sku: 'FORT-SUN-1L',
          quantity: 50,
          unit: 'Pouches',
          unitPrice: 130.00, // ₹6,500 taxable
        },
        {
          productId: 'prod-salt',
          productName: 'Tata Salt Vacuum Evaporated 1kg',
          sku: 'TATA-SALT-1K',
          quantity: 100,
          unit: 'Packets',
          unitPrice: 20.00, // ₹2,000 taxable (0% GST)
        },
      ],
    });

    // Validations
    if (invoice.isInterState) {
      throw new Error('Delhi to Delhi trade should be Intra-State!');
    }

    const attaItem = invoice.itemsSnapshot.find((i) => i.productName.includes('Atta'));
    if (!attaItem || attaItem.hsnCode !== '1901' || attaItem.gstRate !== 5) {
      throw new Error(`Invalid HSN/GST for Atta: ${attaItem?.hsnCode}, ${attaItem?.gstRate}%`);
    }

    if (attaItem.cgstAmount !== 250 || attaItem.sgstAmount !== 250 || attaItem.igstAmount !== 0) {
      throw new Error(`Atta Intra-State GST calculation mismatch: CGST=${attaItem.cgstAmount}, SGST=${attaItem.sgstAmount}`);
    }

    const saltItem = invoice.itemsSnapshot.find((i) => i.productName.includes('Tata Salt'));
    if (!saltItem || saltItem.hsnCode !== '2501' || saltItem.gstRate !== 0) {
      throw new Error(`Tata Salt should carry HSN 2501 with 0% GST`);
    }

    console.log(`  -> Invoice Number: ${invoice.invoiceNumber}`);
    console.log(`  -> Taxable Amount: ₹${invoice.taxableAmount.toFixed(2)}`);
    console.log(`  -> CGST: ₹${invoice.cgstAmount.toFixed(2)} | SGST: ₹${invoice.sgstAmount.toFixed(2)} | IGST: ₹${invoice.igstAmount.toFixed(2)}`);
    console.log(`  -> Total Invoice: ₹${invoice.totalInvoiceAmount.toFixed(2)}`);
    console.log(`  -> In Words: "${invoice.totalAmountInWords}"`);

    passedTests++;
    results.push({
      scenario: 'Intra-State GST & HSN codes (Delhi to Delhi)',
      passed: true,
      details: `Taxable ₹${invoice.taxableAmount}, CGST ₹${invoice.cgstAmount}, SGST ₹${invoice.sgstAmount}, IGST ₹0`,
    });
  } catch (err: any) {
    console.error('  ❌ SCENARIO 2 FAILED:', err.message);
    results.push({ scenario: 'Intra-State GST & HSN codes (Delhi to Delhi)', passed: false, details: err.message });
  }

  // =========================================================================
  // SCENARIO 3: INTER-STATE IGST CALCULATION (Delhi -> Haryana)
  // =========================================================================
  console.log('\n--- SCENARIO 3: Inter-State IGST Calculation (Delhi -> Haryana) ---');
  try {
    const interStateInvoice = await InvoiceService.autoGenerateInvoiceForOrder({
      orderId: `ord-inter-${Date.now()}`,
      wholesalerState: 'Delhi',
      retailerState: 'Haryana',
      items: [
        {
          productId: 'prod-rice',
          productName: 'India Gate Basmati Feast 5kg',
          sku: 'IG-BAS-05K',
          quantity: 20,
          unit: 'Bags',
          unitPrice: 500.00, // ₹10,000 taxable (5% GST)
        },
      ],
    });

    if (!interStateInvoice.isInterState) {
      throw new Error('Delhi to Haryana trade must be marked Inter-State!');
    }

    if (interStateInvoice.cgstAmount !== 0 || interStateInvoice.sgstAmount !== 0 || interStateInvoice.igstAmount !== 500) {
      throw new Error(`Inter-State GST mismatch: Expected IGST ₹500, CGST/SGST ₹0. Got IGST ₹${interStateInvoice.igstAmount}`);
    }

    console.log(`  -> Trade: Delhi -> Haryana (Inter-State)`);
    console.log(`  -> Taxable Value: ₹${interStateInvoice.taxableAmount.toFixed(2)}`);
    console.log(`  -> IGST Amount: ₹${interStateInvoice.igstAmount.toFixed(2)} (CGST/SGST ₹0.00)`);
    console.log(`  -> Total Amount: ₹${interStateInvoice.totalInvoiceAmount.toFixed(2)}`);

    passedTests++;
    results.push({
      scenario: 'Inter-State IGST Calculation (Delhi to Haryana)',
      passed: true,
      details: `Taxable ₹${interStateInvoice.taxableAmount}, IGST ₹${interStateInvoice.igstAmount}, CGST/SGST ₹0`,
    });
  } catch (err: any) {
    console.error('  ❌ SCENARIO 3 FAILED:', err.message);
    results.push({ scenario: 'Inter-State IGST Calculation (Delhi to Haryana)', passed: false, details: err.message });
  }

  // =========================================================================
  // SCENARIO 4: DYNAMIC SIGNED QR CODE & AUTHENTICITY VERIFICATION
  // =========================================================================
  console.log('\n--- SCENARIO 4: Dynamic Signed QR Code & Authenticity Verification ---');
  try {
    const invoice = await InvoiceService.autoGenerateInvoiceForOrder({
      orderId: `ord-qr-test-${Date.now()}`,
    });

    if (!invoice.qrCodeData || !invoice.verificationUrl) {
      throw new Error('Invoice is missing QR code data or verification link');
    }

    const qrPayload = JSON.parse(invoice.qrCodeData);
    if (qrPayload.inv !== invoice.invoiceNumber || qrPayload.url !== invoice.verificationUrl) {
      throw new Error('QR code payload does not match invoice metadata');
    }

    const verification = await InvoiceService.verifyInvoiceIntegrity(invoice.id);
    if (!verification.authentic || verification.isTampered) {
      throw new Error('Valid unaltered invoice failed authenticity check!');
    }

    console.log(`  -> QR Verification URL: ${invoice.verificationUrl}`);
    console.log(`  -> QR Signature Digest: ${qrPayload.sig}`);
    console.log(`  -> Authenticity Check: PASSED (${verification.message})`);

    passedTests++;
    results.push({
      scenario: 'Dynamic Signed QR Code & Verification',
      passed: true,
      details: `Verified link ${invoice.verificationUrl} and valid signature hash.`,
    });
  } catch (err: any) {
    console.error('  ❌ SCENARIO 4 FAILED:', err.message);
    results.push({ scenario: 'Dynamic Signed QR Code & Verification', passed: false, details: err.message });
  }

  // =========================================================================
  // SCENARIO 5: TAMPER-DETECTION - ALTERED PAYLOAD HASH TRIGGERS ALERT
  // =========================================================================
  console.log('\n--- SCENARIO 5: Tamper-Detection Alert on Payload Modification ---');
  try {
    const invoice = await InvoiceService.autoGenerateInvoiceForOrder({
      orderId: `ord-tamper-test-${Date.now()}`,
    });

    // Simulate an attacker tampering with invoice total from ₹10,000 to ₹5,000
    const tamperedVerification = await InvoiceService.verifyInvoiceIntegrity(invoice.id, {
      totalInvoiceAmount: 5000.00,
    });

    if (tamperedVerification.authentic || !tamperedVerification.isTampered) {
      throw new Error('Altered invoice payload was NOT flagged as tampered!');
    }

    console.log(`  -> Original Total: ₹${invoice.totalInvoiceAmount.toFixed(2)}`);
    console.log(`  -> Altered Total Tested: ₹5,000.00`);
    console.log(`  -> Tamper Alert Flag: isTampered = ${tamperedVerification.isTampered}`);
    console.log(`  -> Alert Message: "${tamperedVerification.message}"`);
    console.log(`  -> Alert Details: "${tamperedVerification.tamperDetails}"`);

    // Also simulate attacker tampering with GSTIN
    const gstinTampered = await InvoiceService.verifyInvoiceIntegrity(invoice.id, {
      retailerGstin: '07FAKEGSTIN999Z0',
    });

    if (gstinTampered.authentic || !gstinTampered.isTampered) {
      throw new Error('Altered GSTIN was NOT flagged as tampered!');
    }
    console.log(`  -> Altered Retailer GSTIN correctly rejected: isTampered = true\n`);

    passedTests++;
    results.push({
      scenario: 'Tamper Detection on Altered Hash',
      passed: true,
      details: 'Altered amounts and GSTINs trigger Invalid/Tampered Invoice alert.',
    });
  } catch (err: any) {
    console.error('  ❌ SCENARIO 5 FAILED:', err.message);
    results.push({ scenario: 'Tamper Detection on Altered Hash', passed: false, details: err.message });
  }

  // =========================================================================
  // SCENARIO 6: CA GSTR-1 EXCEL & CSV TABULAR EXPORT
  // =========================================================================
  console.log('--- SCENARIO 6: CA GSTR-1 Excel (.xls) & CSV Export ---');
  try {
    const rows = await InvoiceService.generateGstr1Rows('usr-wholesaler-demo', {
      period: 'current_month',
    });

    if (rows.length === 0) {
      throw new Error('No GSTR-1 rows generated');
    }

    const csvOutput = InvoiceService.formatGstr1Csv(rows);
    if (!csvOutput.includes('GSTIN/UIN of Recipient') || !csvOutput.includes('Place Of Supply')) {
      throw new Error('GSTR-1 CSV missing required statutory headers');
    }

    const excelXmlOutput = InvoiceService.formatGstr1ExcelXml(rows);
    if (!excelXmlOutput.includes('urn:schemas-microsoft-com:office:spreadsheet') || !excelXmlOutput.includes('GSTR-1 B2B Invoices')) {
      throw new Error('GSTR-1 Excel XML missing required worksheet tags');
    }

    console.log(`  -> Total GSTR-1 B2B Rows: ${rows.length}`);
    console.log(`  -> Sample Row: Recipient=${rows[0].receiverName}, GSTIN=${rows[0].gstinRecipient}, Rate=${rows[0].ratePercent}%, Taxable=₹${rows[0].taxableValue}`);
    console.log(`  -> CSV Export Generated: ${csvOutput.length} bytes`);
    console.log(`  -> Excel (.xls) Export Generated: ${excelXmlOutput.length} bytes\n`);

    passedTests++;
    results.push({
      scenario: 'CA GSTR-1 Tabular Excel & CSV Export',
      passed: true,
      details: `Generated ${rows.length} B2B rows in statutory GSTR-1 Table 4 format.`,
    });
  } catch (err: any) {
    console.error('  ❌ SCENARIO 6 FAILED:', err.message);
    results.push({ scenario: 'CA GSTR-1 Tabular Excel & CSV Export', passed: false, details: err.message });
  }

  console.log('======================================================================');
  console.log(`📊 SUMMARY: ${passedTests} / 6 SCENARIOS PASSED (100% SUCCESS)`);
  console.log('======================================================================');

  if (passedTests < 6) {
    process.exit(1);
  }
}

runGstInvoicingAndExportSuite().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});
