// Usage: npm run set-role -- <username> <OWNER|ADMIN|MODERATOR|SUPPORT|USER>
import { PrismaClient, Role } from '@prisma/client';

const [username, role] = process.argv.slice(2);
if (!username || !(role in Role)) {
  console.error('Usage: npm run set-role -- <username> <OWNER|ADMIN|MODERATOR|SUPPORT|USER>');
  process.exit(1);
}
const db = new PrismaClient();
db.user
  .update({ where: { username }, data: { role: role as Role } })
  .then((user) => console.log(`${user.username} ist jetzt ${user.role}.`))
  .finally(() => db.$disconnect());
