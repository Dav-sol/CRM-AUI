import { UsersService } from './users.service';
import { PrismaService } from '../../core/database/prisma.service';

interface UserRepo {
  findUnique: jest.Mock;
  update: jest.Mock;
}

describe('UsersService', () => {
  let service: UsersService;
  let user: UserRepo;

  beforeEach(() => {
    user = { findUnique: jest.fn(), update: jest.fn() };
    const prisma = { user } as unknown as PrismaService;
    service = new UsersService(prisma);
  });

  it('looks up a user by email including role', async () => {
    user.findUnique.mockResolvedValue({ id: 'u1' });
    await service.findByEmail('admin@org.test');
    expect(user.findUnique).toHaveBeenCalledWith({
      where: { email: 'admin@org.test' },
      include: { role: true },
    });
  });

  it('hashes and verifies passwords with bcrypt', async () => {
    const hash = await service.hashPassword('ValidPass123');
    expect(hash).not.toContain('ValidPass123');
    await expect(service.verifyPassword('ValidPass123', hash)).resolves.toBe(
      true,
    );
    await expect(service.verifyPassword('WrongPass', hash)).resolves.toBe(
      false,
    );
  });

  it('updates the password hash', async () => {
    user.update.mockResolvedValue({ id: 'u1' });
    await service.updatePassword('u1', 'new-hash');
    expect(user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { passwordHash: 'new-hash' },
    });
  });
});
