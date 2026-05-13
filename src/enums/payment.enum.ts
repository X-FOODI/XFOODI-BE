export enum PaymentStatus {
  PENDING = 0,
  COMPLETED = 1,
  FAILED = 2,
  REFUNDED = 3,
  CANCELLED = 4,
}

export enum PaymentPurpose {
  ORDER = 0,
  DEPOSIT = 1,
  REFUND = 2,
}
