const fs = require('fs');
let content = fs.readFileSync('prisma/schema.prisma');
const str = content.toString('utf8');
const idx = str.indexOf('@@map("WithdrawalRequests")\n}');
if (idx !== -1) {
  const cleanStr = str.substring(0, idx + '@@map("WithdrawalRequests")\n}'.length);
  const newContent = cleanStr + '\n\nmodel SystemSetting {\n  id          String   @id @default(uuid())\n  key         String   @unique\n  value       String   @db.Text\n  description String?\n  isPublic    Boolean  @default(false)\n  createdAt   DateTime @default(now())\n  updatedAt   DateTime @updatedAt\n\n  @@map("SystemSettings")\n}\n';
  fs.writeFileSync('prisma/schema.prisma', newContent, 'utf8');
  console.log('Fixed schema.prisma encoding and added SystemSetting');
} else {
  console.log('Could not find WithdrawalRequests');
}
