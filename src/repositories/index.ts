// Export all repositories
export { BaseRepository } from './base/BaseRepository';
export { ProductRepository } from './ProductRepository';
export { UserRepository } from './UserRepository';
export { OrderRepository } from './OrderRepository';

// Create singleton instances
import { OrderRepository } from './OrderRepository';
import { ProductRepository } from './ProductRepository';
import { UserRepository } from './UserRepository';

export const productRepository = new ProductRepository();
export const userRepository = new UserRepository();
export const orderRepository = new OrderRepository();
