import './src/config/env';
import { PrismaClient } from '@prisma/client';
import { centralPrisma, getTenantPrisma, getTenantConnectionUrl, prismaStorage } from './src/lib/prisma';

function getPayOS(): any | null {
  const clientId = process.env.PAYOS_CLIENT_ID?.trim();
  const apiKey = process.env.PAYOS_API_KEY?.trim();
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY?.trim();

  if (!clientId || !apiKey || !checksumKey) {
    return null;
  }
  try {
    const { PayOS } = require('@payos/node');
    return new PayOS({ clientId, apiKey, checksumKey });
  } catch (e) {
    return null;
  }
}

async function main() {
  const payos = getPayOS();
  if (!payos) {
    console.error('PayOS is not configured.');
    return;
  }

  try {
    const restaurants = await centralPrisma.restaurant.findMany();
    const baseUrl = process.env.DATABASE_URL ?? '';

    for (const r of restaurants) {
      console.log(`Processing refunds for: ${r.name} (${r.slug})`);
      const tenantDbUrl = getTenantConnectionUrl(baseUrl, r.slug);
      const tenantPrisma = getTenantPrisma(tenantDbUrl);

      await prismaStorage.run(tenantPrisma, async () => {
        const tenantClient = new PrismaClient({
          datasources: { db: { url: tenantDbUrl } }
        });

        try {
          const pendingRefunds = await tenantClient.refund.findMany({
            where: { status: 'PENDING' },
            include: {
              reservation: {
                include: {
                  customer: true,
                  payments: {
                    include: { paymentMethod: true }
                  }
                }
              }
            }
          });

          console.log(`Found ${pendingRefunds.length} pending refunds.`);

          for (const refund of pendingRefunds) {
            console.log(`Processing Refund ID: ${refund.id}, Amount: ${refund.amount}`);
            const reservation = refund.reservation;
            if (!reservation) {
              console.log(`No reservation associated with refund ${refund.id}. Skipping.`);
              continue;
            }

            const customer = reservation.customer;
            const bankRefund = (customer?.metadata as any)?.bankRefund;

            if (!bankRefund || !bankRefund.accountNumber || !bankRefund.bankBin) {
              console.log(`No bank refund metadata for customer. Skipping.`);
              continue;
            }

            const isBankTransfer = reservation.payments.some((p: any) => {
              const code = p.paymentMethod?.code ?? '';
              return code === 'BANK_TRANSFER' || code === 'SEPAY';
            });

            if (!isBankTransfer) {
              console.log(`Deposit was not paid via bank transfer. Skipping.`);
              continue;
            }

            const referenceId = `REFUND_${Date.now().toString().slice(-10)}_${refund.id.slice(0, 6)}`;
            console.log(`Calling PayOS payouts.create with referenceId: ${referenceId}`);

            try {
              const result = await (payos as any).payouts.create(
                {
                  referenceId,
                  amount: Math.floor(Number(refund.amount)),
                  description: `XFOODI HOAN COC ${reservation.confirmationCode ?? reservation.id.slice(0, 6)}`.slice(0, 50),
                  toBin: bankRefund.bankBin,
                  toAccountNumber: bankRefund.accountNumber,
                },
                referenceId
              );

              // Update refund record to COMPLETED
              await tenantClient.refund.update({
                where: { id: refund.id },
                data: {
                  status: 'COMPLETED',
                  metadata: {
                    ...(refund.metadata as any ?? {}),
                    payout_method: 'PAYOS_AUTO_RETRY',
                    payout_result: { externalTxId: result?.id ?? referenceId, status: 'SUCCESS' },
                    refund_bank: {
                      bankBin: bankRefund.bankBin,
                      bankCode: bankRefund.bankCode ?? '',
                      bankName: bankRefund.bankName ?? '',
                      accountNumber: bankRefund.accountNumber,
                      accountName: bankRefund.accountName,
                    }
                  }
                }
              });

              console.log(`SUCCESS: Refund ${refund.id} processed successfully!`);
            } catch (payoutErr: any) {
              console.error(`PayOS Error:`, payoutErr.message);

              // Update refund record to FAILED
              await tenantClient.refund.update({
                where: { id: refund.id },
                data: {
                  status: 'FAILED',
                  metadata: {
                    ...(refund.metadata as any ?? {}),
                    payout_method: 'PAYOS_AUTO_RETRY',
                    payout_error: payoutErr?.message ?? 'Unknown payout error',
                    refund_bank: {
                      bankBin: bankRefund.bankBin,
                      accountNumber: bankRefund.accountNumber,
                      accountName: bankRefund.accountName,
                    }
                  }
                }
              });
            }
          }
        } catch (e: any) {
          console.error(`Error querying tenant database:`, e.message);
        } finally {
          await tenantClient.$disconnect();
        }
      });
    }

  } catch (err: any) {
    console.error('ERROR:', err.message);
  } finally {
    await centralPrisma.$disconnect();
  }
}

main();
