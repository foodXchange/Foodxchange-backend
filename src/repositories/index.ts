// Export all repositories
export { BaseRepository } from './base/BaseRepository';
export { ProductRepository } from './ProductRepository';
export { UserRepository } from './UserRepository';
export { OrderRepository } from './OrderRepository';

// Create singleton instances
import { ProductRepository } from './ProductRepository';
import { UserRepository } from './UserRepository';
import { OrderRepository } from './OrderRepository';

export const productRepository = new ProductRepository();
export const userRepository = new UserRepository();
export const orderRepository = new OrderRepository();