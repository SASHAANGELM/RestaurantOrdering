/** Local stock photo sources are documented in apps/backend/src/assets/images/README.md. */
const dish = (name: string, priceMinor: number | null, image: string, description: string) =>
  ({ name, priceMinor, imageUrl: `/api/images/${image}.jpg`, description });
export const demoMenu = [
  { name: 'Starters', items: [
    dish('Soup', 650, 'soup', 'A warming bowl of seasonal vegetables with fresh herbs.'),
    dish('Salad', 850, 'salad', 'Crisp garden leaves, cherry tomatoes and house dressing.'),
    dish('Bread', 450, 'bread', 'Warm artisan bread served with whipped butter.'),
    dish('Roasted vegetables', 750, 'vegetables', 'Seasonal vegetables roasted with olive oil and thyme.'),
    dish('Bruschetta', 700, 'bread', 'Toasted sourdough with tomatoes, basil and garlic.'),
    dish('Garden bowl', 950, 'salad', 'Fresh greens, crunchy vegetables and lemon vinaigrette.')
  ] },
  { name: 'Mains', items: [
    dish('Pasta', 1450, 'pasta', 'Pasta tossed in a slow-simmered tomato and basil sauce.'),
    dish('Burger', 1550, 'burger', 'Grilled beef, cheddar, crisp lettuce and our house sauce.'),
    dish('Seasonal special', null, 'vegetables', 'Ask the kitchen about today’s seasonal creation.'),
    dish('Creamy mushroom pasta', 1650, 'pasta', 'Pasta with sautéed mushrooms and parmesan cream.'),
    dish('Garden burger', 1350, 'burger', 'A vegetable patty with fresh greens and tomato relish.'),
    dish('Brunch plate', 1250, 'breakfast', 'A generous breakfast plate, served all day.')
  ] },
  { name: 'Desserts', items: [
    dish('Cake', 750, 'cake', 'A slice of rich chocolate cake for a sweet finish.'),
    dish('Ice cream', 550, 'ice-cream', 'Creamy scoops with a seasonal topping.'),
    dish('Fruit', 600, 'breakfast', 'A selection of fresh seasonal fruit.'),
    dish('Chocolate celebration', 850, 'cake', 'Chocolate layers with a smooth cocoa frosting.'),
    dish('Vanilla sundae', 650, 'ice-cream', 'Vanilla ice cream with a drizzle of chocolate sauce.'),
    dish('Sweet breakfast', 900, 'breakfast', 'A sweet brunch treat with seasonal fruit.')
  ] },
  { name: 'Drinks', items: [
    dish('Coffee', 350, 'coffee', 'Freshly brewed coffee, made to order.'),
    dish('Tea', 300, 'coffee', 'Your choice of black, green or herbal tea.'),
    dish('Custom drink', null, 'juice', 'Let us make something just for you.'),
    dish('Fresh orange juice', 500, 'juice', 'Fresh, bright and full of citrus flavour.'),
    dish('Cappuccino', 450, 'coffee', 'Espresso with steamed milk and a soft foam.'),
    dish('House lemonade', 450, 'juice', 'Refreshing lemon, water and a touch of sweetness.')
  ] },
  { name: 'Pizzas', items: [
    dish('Margherita pizza', 1350, 'pizza', 'Tomato, mozzarella and fresh basil on a crisp base.'),
    dish('Pepperoni pizza', 1550, 'pizza', 'Mozzarella, tomato sauce and generous pepperoni.'),
    dish('Garden pizza', 1450, 'pizza', 'Roasted vegetables, mozzarella and fresh herbs.'),
    dish('Mushroom pizza', 1500, 'pizza', 'Mushrooms, mozzarella and a hint of garlic.'),
    dish('Four cheese pizza', 1650, 'pizza', 'A rich blend of four cheeses on our house dough.'),
    dish('House pizza', 1750, 'pizza', 'The kitchen’s signature combination of seasonal toppings.')
  ] },
  { name: 'Sides', items: [
    dish('Side salad', 450, 'salad', 'A little bowl of fresh leaves and house dressing.'),
    dish('Garlic bread', 500, 'bread', 'Toasted bread brushed with garlic and herb butter.'),
    dish('Seasonal greens', 550, 'vegetables', 'Vegetables simply prepared with olive oil.'),
    dish('Small soup', 450, 'soup', 'A small serving of our comforting seasonal soup.'),
    dish('Warm bread basket', 650, 'bread', 'A selection of warm bread to share.'),
    dish('Roasted vegetable bowl', 650, 'vegetables', 'A colourful bowl of slow-roasted vegetables.')
  ] }
];
