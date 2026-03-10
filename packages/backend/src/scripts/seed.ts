/**
 * Demo seed script — creates a project with sample data for demo purposes.
 * Run: npx tsx src/scripts/seed.ts
 *
 * Creates:
 * - 1 project (Storees Demo Store)
 * - 20 customers with realistic data
 * - 40+ orders with line items
 * - 80+ events (cart_created, order_placed, etc.)
 * - 4 default segments (auto-evaluated)
 * - 1 abandoned cart flow (draft)
 */

import 'dotenv/config'
import { db, pool } from '../db/connection.js'
import {
  projects,
  customers,
  orders,
  events,
} from '../db/schema.js'
import { instantiateDefaultSegments } from '../services/segmentService.js'
import { instantiateDefaultFlows } from '../services/flowService.js'
import { evaluateAllSegments } from '../services/segmentService.js'

const DEMO_CUSTOMERS = [
  { name: 'Priya Sharma', email: 'priya@example.com', phone: '+919876543210', totalOrders: 5, totalSpent: 12500.00, emailSubscribed: true },
  { name: 'Rahul Patel', email: 'rahul@example.com', phone: '+919876543211', totalOrders: 3, totalSpent: 8200.00, emailSubscribed: true },
  { name: 'Ananya Krishnan', email: 'ananya@example.com', phone: '+919876543212', totalOrders: 8, totalSpent: 24000.00, emailSubscribed: true, smsSubscribed: true },
  { name: 'Vikram Singh', email: 'vikram@example.com', phone: '+919876543213', totalOrders: 1, totalSpent: 1500.00, emailSubscribed: false },
  { name: 'Deepa Nair', email: 'deepa@example.com', phone: '+919876543214', totalOrders: 12, totalSpent: 45000.00, emailSubscribed: true, smsSubscribed: true },
  { name: 'Arjun Mehta', email: 'arjun@example.com', phone: '+919876543215', totalOrders: 2, totalSpent: 3800.00, emailSubscribed: true },
  { name: 'Kavitha Iyer', email: 'kavitha@example.com', phone: '+919876543216', totalOrders: 0, totalSpent: 0, emailSubscribed: true },
  { name: 'Suresh Kumar', email: 'suresh@example.com', phone: '+919876543217', totalOrders: 6, totalSpent: 18900.00, emailSubscribed: true },
  { name: 'Meera Reddy', email: 'meera@example.com', phone: '+919876543218', totalOrders: 4, totalSpent: 9600.00, emailSubscribed: false },
  { name: 'Aditya Joshi', email: 'aditya@example.com', phone: '+919876543219', totalOrders: 15, totalSpent: 67500.00, emailSubscribed: true, smsSubscribed: true },
  { name: 'Lakshmi Menon', email: 'lakshmi@example.com', phone: '+919876543220', totalOrders: 2, totalSpent: 4200.00, emailSubscribed: true },
  { name: 'Nikhil Gupta', email: 'nikhil@example.com', phone: '+919876543221', totalOrders: 7, totalSpent: 21000.00, emailSubscribed: true },
  { name: 'Shruti Bhat', email: 'shruti@example.com', phone: '+919876543222', totalOrders: 1, totalSpent: 2100.00, emailSubscribed: false },
  { name: 'Rajesh Verma', email: 'rajesh@example.com', phone: '+919876543223', totalOrders: 9, totalSpent: 31500.00, emailSubscribed: true, smsSubscribed: true },
  { name: 'Divya Pillai', email: 'divya@example.com', phone: '+919876543224', totalOrders: 3, totalSpent: 7800.00, emailSubscribed: true },
  { name: 'Karthik Rajan', email: 'karthik@example.com', phone: '+919876543225', totalOrders: 0, totalSpent: 0, emailSubscribed: true },
  { name: 'Pooja Agarwal', email: 'pooja@example.com', phone: '+919876543226', totalOrders: 4, totalSpent: 11200.00, emailSubscribed: true },
  { name: 'Sanjay Desai', email: 'sanjay@example.com', phone: '+919876543227', totalOrders: 11, totalSpent: 38500.00, emailSubscribed: true, smsSubscribed: true },
  { name: 'Ritu Kapoor', email: 'ritu@example.com', phone: '+919876543228', totalOrders: 2, totalSpent: 5400.00, emailSubscribed: false },
  { name: 'Amit Choudhary', email: 'amit@example.com', phone: '+919876543229', totalOrders: 6, totalSpent: 16800.00, emailSubscribed: true },
]

const PRODUCTS = [
  { title: 'Organic Cotton T-Shirt', price: 1200, variant: 'M / Navy' },
  { title: 'Handloom Silk Scarf', price: 2800, variant: 'One Size / Crimson' },
  { title: 'Bamboo Water Bottle', price: 650, variant: '750ml / Green' },
  { title: 'Artisan Coffee Mug', price: 450, variant: 'Standard / Terracotta' },
  { title: 'Natural Soap Set', price: 890, variant: '4-pack / Lavender' },
  { title: 'Jute Tote Bag', price: 1100, variant: 'Large / Natural' },
  { title: 'Coconut Oil (Cold Pressed)', price: 380, variant: '500ml' },
  { title: 'Handmade Candle Set', price: 1450, variant: '3-pack / Sandalwood' },
  { title: 'Organic Honey', price: 520, variant: '250g / Wild Forest' },
  { title: 'Block Print Cushion Cover', price: 950, variant: '18x18 / Indigo' },
]

function randomDate(daysAgo: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * daysAgo))
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60))
  return d
}

function randomItems(count: number) {
  const items = []
  for (let i = 0; i < count; i++) {
    const product = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)]
    items.push({
      title: product.title,
      price: product.price,
      quantity: Math.floor(Math.random() * 3) + 1,
      variant_title: product.variant,
    })
  }
  return items
}

async function seed() {
  console.log('🌱 Starting demo seed...\n')

  // 1. Create project
  const [project] = await db.insert(projects).values({
    name: 'Storees Demo Store',
    shopifyDomain: 'demo-store.myshopify.com',
    businessType: 'ecommerce',
  }).returning()
  console.log(`✓ Created project: ${project.name} (${project.id})`)

  // 2. Create customers
  const customerRows = []
  for (const c of DEMO_CUSTOMERS) {
    const firstSeen = randomDate(90)
    const lastSeen = c.totalOrders > 0 ? randomDate(14) : firstSeen
    const avgOrderValue = c.totalOrders > 0 ? c.totalSpent / c.totalOrders : 0

    const [row] = await db.insert(customers).values({
      projectId: project.id,
      externalId: `shopify_${c.email.split('@')[0]}`,
      email: c.email,
      phone: c.phone,
      name: c.name,
      firstSeen,
      lastSeen,
      totalOrders: c.totalOrders,
      totalSpent: c.totalSpent.toFixed(2),
      avgOrderValue: avgOrderValue.toFixed(2),
      clv: (c.totalSpent * 1.2).toFixed(2),
      emailSubscribed: c.emailSubscribed,
      smsSubscribed: c.smsSubscribed ?? false,
    }).returning()
    customerRows.push(row)
  }
  console.log(`✓ Created ${customerRows.length} customers`)

  // 3. Create orders + events
  let orderCount = 0
  let eventCount = 0

  for (let i = 0; i < customerRows.length; i++) {
    const customer = customerRows[i]
    const numOrders = DEMO_CUSTOMERS[i].totalOrders

    for (let j = 0; j < numOrders; j++) {
      const items = randomItems(Math.floor(Math.random() * 3) + 1)
      const total = items.reduce((s, item) => s + item.price * item.quantity, 0)
      const orderDate = randomDate(60)
      const fulfilled = Math.random() > 0.2
      const fulfilledAt = fulfilled ? new Date(orderDate.getTime() + 3 * 24 * 60 * 60 * 1000) : null

      const [order] = await db.insert(orders).values({
        projectId: project.id,
        customerId: customer.id,
        externalOrderId: `demo_${customer.id.slice(0, 8)}_${j}`,
        status: fulfilled ? 'fulfilled' : 'pending',
        total: total.toFixed(2),
        currency: 'INR',
        lineItems: items,
        createdAt: orderDate,
        fulfilledAt,
      }).returning()
      orderCount++

      // Order placed event
      await db.insert(events).values({
        projectId: project.id,
        customerId: customer.id,
        eventName: 'order_placed',
        properties: { order_id: order.id, total, item_count: items.length },
        platform: 'shopify',
        timestamp: orderDate,
      })
      eventCount++

      // Order fulfilled event
      if (fulfilled && fulfilledAt) {
        await db.insert(events).values({
          projectId: project.id,
          customerId: customer.id,
          eventName: 'order_fulfilled',
          properties: { order_id: order.id },
          platform: 'shopify',
          timestamp: fulfilledAt,
        })
        eventCount++
      }
    }

    // Add cart_created events for some customers (simulates abandoned carts)
    if (Math.random() > 0.5) {
      const cartItems = randomItems(2)
      const cartValue = cartItems.reduce((s, item) => s + item.price * item.quantity, 0)
      await db.insert(events).values({
        projectId: project.id,
        customerId: customer.id,
        eventName: 'cart_created',
        properties: { cart_value: cartValue, items: cartItems },
        platform: 'shopify',
        timestamp: randomDate(7),
      })
      eventCount++
    }

    // Customer created event
    await db.insert(events).values({
      projectId: project.id,
      customerId: customer.id,
      eventName: 'customer_created',
      properties: { source: 'demo_seed' },
      platform: 'shopify',
      timestamp: customer.firstSeen,
    })
    eventCount++
  }
  console.log(`✓ Created ${orderCount} orders`)
  console.log(`✓ Created ${eventCount} events`)

  // 4. Create default segments
  await instantiateDefaultSegments(project.id)
  console.log('✓ Created default segments')

  // 5. Evaluate segments
  await evaluateAllSegments(project.id)
  console.log('✓ Evaluated all segments')

  // 6. Create default flows
  await instantiateDefaultFlows(project.id)
  console.log('✓ Created default flows (draft)')

  console.log(`\n🎉 Demo seed complete!`)
  console.log(`\nProject ID: ${project.id}`)
  console.log(`Set this in your frontend .env.local:`)
  console.log(`  NEXT_PUBLIC_PROJECT_ID=${project.id}`)

  await pool.end()
  process.exit(0)
}

seed().catch(err => {
  console.error('Seed failed:', err)
  process.exit(1)
})
