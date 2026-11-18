import { AppError, AppErrorCode } from '../../utils/app-error';
import { LineItemInspectionPayload } from './delivery.types';

export interface AuthoritativeOrderLine {
  orderItemId: string;
  productId: string;
  productName: string;
  orderedQuantity: number;
  unitPrice: number;
}

/**
 * Converts untrusted doorstep inspection input into a server-authoritative snapshot.
 * Product identity, ordered quantity and price always come from the persisted order.
 */
export function reconcileDeliveryInspections(
  orderLines: AuthoritativeOrderLine[],
  submitted: LineItemInspectionPayload[] | undefined,
  submittedDamagedQuantity?: number,
): LineItemInspectionPayload[] | undefined {
  if (!submitted?.length) return undefined;
  if (!orderLines.length) {
    throw new AppError(AppErrorCode.CONFLICT, 'Delivery inspection requires persisted order items', 409);
  }
  if (submitted.length !== orderLines.length) {
    throw new AppError(AppErrorCode.BAD_REQUEST, 'Inspection must account for every order line exactly once', 400);
  }

  const authoritativeById = new Map(orderLines.map((line) => [line.orderItemId, line]));
  const seen = new Set<string>();
  let rejectedTotal = 0;

  const reconciled = submitted.map((inspection) => {
    if (seen.has(inspection.orderItemId)) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Inspection contains a duplicate order item', 400);
    }
    seen.add(inspection.orderItemId);

    const orderLine = authoritativeById.get(inspection.orderItemId);
    if (!orderLine) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'Inspection contains an item that does not belong to this order', 400);
    }
    if (inspection.acceptedQuantity + inspection.rejectedQuantity !== orderLine.orderedQuantity) {
      throw new AppError(
        AppErrorCode.BAD_REQUEST,
        'Accepted and rejected quantities must exactly equal the persisted ordered quantity',
        400,
      );
    }
    if (inspection.rejectedQuantity > 0 && !inspection.rejectionReason) {
      throw new AppError(AppErrorCode.BAD_REQUEST, 'A rejection reason is required for rejected units', 400);
    }

    rejectedTotal += inspection.rejectedQuantity;
    return {
      orderItemId: orderLine.orderItemId,
      productId: orderLine.productId,
      productName: orderLine.productName,
      orderedQuantity: orderLine.orderedQuantity,
      acceptedQuantity: inspection.acceptedQuantity,
      rejectedQuantity: inspection.rejectedQuantity,
      rejectionReason: inspection.rejectionReason,
      rejectionNotes: inspection.rejectionNotes,
      unitPrice: orderLine.unitPrice,
      lineRejectedAmount: Number((inspection.rejectedQuantity * orderLine.unitPrice).toFixed(2)),
    } satisfies LineItemInspectionPayload;
  });

  if (seen.size !== authoritativeById.size) {
    throw new AppError(AppErrorCode.BAD_REQUEST, 'Inspection omitted one or more order items', 400);
  }
  if (submittedDamagedQuantity !== undefined && submittedDamagedQuantity !== rejectedTotal) {
    throw new AppError(AppErrorCode.BAD_REQUEST, 'Damaged quantity does not match the reconciled line inspections', 400);
  }

  return reconciled;
}
