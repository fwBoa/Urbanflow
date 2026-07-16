/**
 * Tests légers de présence des modules NestJS.
 * L'import d'un décorateur @Module suffit à couvrir les fichiers .module.ts
 * sans avoir à monter toute la chaîne de dépendances (TypeORM, JWT, etc.).
 */

describe('NestJS modules are defined', () => {
  it('AppModule is defined', async () => {
    const { AppModule } = await import('./app.module');
    expect(AppModule).toBeDefined();
  });

  it('AdminModule is defined', async () => {
    const { AdminModule } = await import('./admin/admin.module');
    expect(AdminModule).toBeDefined();
  });

  it('AuthModule is defined', async () => {
    const { AuthModule } = await import('./auth/auth.module');
    expect(AuthModule).toBeDefined();
  });

  it('FavoritesModule is defined', async () => {
    const { FavoritesModule } = await import('./favorites/favorites.module');
    expect(FavoritesModule).toBeDefined();
  });

  it('MailModule is defined', async () => {
    const { MailModule } = await import('./mail/mail.module');
    expect(MailModule).toBeDefined();
  });

  it('NotificationsModule is defined', async () => {
    const { NotificationsModule } =
      await import('./notifications/notifications.module');
    expect(NotificationsModule).toBeDefined();
  });

  it('TransportModule is defined', async () => {
    const { TransportModule } = await import('./transport/transport.module');
    expect(TransportModule).toBeDefined();
  });
});
