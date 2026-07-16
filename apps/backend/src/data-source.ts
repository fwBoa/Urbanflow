import { DataSource } from 'typeorm';
import { User } from './auth/user.entity';
import { Favorite } from './favorites/favorite.entity';
import { History } from './favorites/history.entity';
import { Notification } from './notifications/notification.entity';
import { PushSubscription } from './notifications/push-subscription.entity';

export default new DataSource({
  type: 'postgres',
  url:
    process.env.DATABASE_URL ||
    'postgresql://urbanflow:urbanflow_dev@localhost:5432/urbanflow',
  entities: [User, Favorite, History, Notification, PushSubscription],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: process.env.NODE_ENV !== 'production',
});
