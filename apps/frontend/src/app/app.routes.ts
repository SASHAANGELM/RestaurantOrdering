import { type Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'menu' },
  { path: 'menu', title: 'Menu | Restaurant Ordering', loadComponent: () => import('./features/menu/menu.page').then((module) => module.MenuPage) },
  { path: 'cart', title: 'Cart | Restaurant Ordering', loadComponent: () => import('./features/menu/cart.page').then((module) => module.CartPage) },
  { path: 'setup/categories', title: 'Categories | Restaurant Ordering', data: { kind: 'categories' }, loadComponent: () => import('./features/setup/catalog.page').then((module) => module.CatalogPage) },
  { path: 'setup/items', title: 'Items | Restaurant Ordering', data: { kind: 'items' }, loadComponent: () => import('./features/setup/catalog.page').then((module) => module.CatalogPage) },
  { path: 'setup', title: 'Settings | Restaurant Ordering', loadComponent: () => import('./features/setup/setup.page').then((module) => module.SetupPage) },
  { path: 'orders', title: 'Orders | Restaurant Ordering', loadComponent: () => import('./features/orders/orders.page').then((module) => module.OrdersPage) },
  { path: 'orders/:id', title: 'Order details | Restaurant Ordering', loadComponent: () => import('./features/orders/order-detail.page').then((module) => module.OrderDetailPage) },
  { path: '**', redirectTo: 'menu' }
];
