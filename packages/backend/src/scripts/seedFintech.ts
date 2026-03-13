/**
 * Fintech demo seed script — simulates a bank's backend integrating with Storees.
 *
 * Run: npx tsx src/scripts/seedFintech.ts
 *
 * What it does:
 * 1. Creates a fintech project via the onboarding API
 * 2. Gets API keys back
 * 3. Upserts 25 customers (varied profiles: KYC status, account types, balances)
 * 4. Fires 150+ realistic events via the v1 Events API:
 *    - transaction_completed (UPI, NEFT, IMPS, card)
 *    - loan_disbursed, emi_paid, emi_overdue
 *    - kyc_verified, kyc_expired
 *    - sip_started, sip_executed
 *    - bill_payment_completed
 *    - app_login, card_activated
 * 5. Creates entities (accounts, loans, SIPs)
 * 6. Checks integration status
 * 7. Prints summary
 *
 * This exercises the FULL pipeline: API key auth → data masking → identity resolution
 * → event persistence → entity upsert → integration status verification.
 */

const BASE_URL = process.env.APP_URL ?? 'http://localhost:3001'

// ============ CUSTOMER DATA ============

const FINTECH_CUSTOMERS = [
  { id: 'CUST_001', name: 'Priya Sharma', email: 'priya.sharma@example.com', phone: '+919876543210', kyc: 'verified', accountType: 'savings', balanceBracket: '1L-5L', salaryBracket: '50K-1L', cityTier: 'tier1' },
  { id: 'CUST_002', name: 'Rahul Patel', email: 'rahul.patel@example.com', phone: '+919876543211', kyc: 'verified', accountType: 'savings', balanceBracket: '25L+', salaryBracket: '1L+', cityTier: 'tier1' },
  { id: 'CUST_003', name: 'Ananya Krishnan', email: 'ananya.k@example.com', phone: '+919876543212', kyc: 'verified', accountType: 'current', balanceBracket: '5L-25L', salaryBracket: '1L+', cityTier: 'tier1' },
  { id: 'CUST_004', name: 'Vikram Singh', email: 'vikram.singh@example.com', phone: '+919876543213', kyc: 'pending', accountType: 'savings', balanceBracket: '0-10K', salaryBracket: '0-25K', cityTier: 'tier3' },
  { id: 'CUST_005', name: 'Deepa Nair', email: 'deepa.nair@example.com', phone: '+919876543214', kyc: 'verified', accountType: 'savings', balanceBracket: '10K-1L', salaryBracket: '25K-50K', cityTier: 'tier2' },
  { id: 'CUST_006', name: 'Arjun Mehta', email: 'arjun.mehta@example.com', phone: '+919876543215', kyc: 'verified', accountType: 'demat', balanceBracket: '5L-25L', salaryBracket: '1L+', cityTier: 'tier1' },
  { id: 'CUST_007', name: 'Kavitha Iyer', email: 'kavitha.iyer@example.com', phone: '+919876543216', kyc: 'expired', accountType: 'savings', balanceBracket: '10K-1L', salaryBracket: '25K-50K', cityTier: 'tier2' },
  { id: 'CUST_008', name: 'Suresh Kumar', email: 'suresh.kumar@example.com', phone: '+919876543217', kyc: 'verified', accountType: 'credit_card', balanceBracket: '1L-5L', salaryBracket: '50K-1L', cityTier: 'tier1' },
  { id: 'CUST_009', name: 'Meera Reddy', email: 'meera.reddy@example.com', phone: '+919876543218', kyc: 'verified', accountType: 'savings', balanceBracket: '10K-1L', salaryBracket: '25K-50K', cityTier: 'tier2' },
  { id: 'CUST_010', name: 'Aditya Joshi', email: 'aditya.joshi@example.com', phone: '+919876543219', kyc: 'verified', accountType: 'savings', balanceBracket: '25L+', salaryBracket: '1L+', cityTier: 'tier1' },
  { id: 'CUST_011', name: 'Lakshmi Menon', email: 'lakshmi.menon@example.com', phone: '+919876543220', kyc: 'verified', accountType: 'savings', balanceBracket: '1L-5L', salaryBracket: '50K-1L', cityTier: 'tier1' },
  { id: 'CUST_012', name: 'Nikhil Gupta', email: 'nikhil.gupta@example.com', phone: '+919876543221', kyc: 'verified', accountType: 'loan', balanceBracket: '10K-1L', salaryBracket: '25K-50K', cityTier: 'tier2' },
  { id: 'CUST_013', name: 'Shruti Bhat', email: 'shruti.bhat@example.com', phone: '+919876543222', kyc: 'pending', accountType: 'savings', balanceBracket: '0-10K', salaryBracket: '0-25K', cityTier: 'tier3' },
  { id: 'CUST_014', name: 'Rajesh Verma', email: 'rajesh.verma@example.com', phone: '+919876543223', kyc: 'verified', accountType: 'current', balanceBracket: '5L-25L', salaryBracket: '1L+', cityTier: 'tier1' },
  { id: 'CUST_015', name: 'Divya Pillai', email: 'divya.pillai@example.com', phone: '+919876543224', kyc: 'verified', accountType: 'savings', balanceBracket: '1L-5L', salaryBracket: '50K-1L', cityTier: 'tier1' },
  { id: 'CUST_016', name: 'Karthik Rajan', email: 'karthik.rajan@example.com', phone: '+919876543225', kyc: 'verified', accountType: 'demat', balanceBracket: '25L+', salaryBracket: '1L+', cityTier: 'tier1' },
  { id: 'CUST_017', name: 'Pooja Agarwal', email: 'pooja.agarwal@example.com', phone: '+919876543226', kyc: 'verified', accountType: 'savings', balanceBracket: '10K-1L', salaryBracket: '25K-50K', cityTier: 'tier2' },
  { id: 'CUST_018', name: 'Sanjay Desai', email: 'sanjay.desai@example.com', phone: '+919876543227', kyc: 'verified', accountType: 'savings', balanceBracket: '5L-25L', salaryBracket: '1L+', cityTier: 'tier1' },
  { id: 'CUST_019', name: 'Ritu Kapoor', email: 'ritu.kapoor@example.com', phone: '+919876543228', kyc: 'expired', accountType: 'savings', balanceBracket: '0-10K', salaryBracket: '0-25K', cityTier: 'tier3' },
  { id: 'CUST_020', name: 'Amit Choudhary', email: 'amit.choudhary@example.com', phone: '+919876543229', kyc: 'verified', accountType: 'savings', balanceBracket: '1L-5L', salaryBracket: '50K-1L', cityTier: 'tier2' },
  { id: 'CUST_021', name: 'Neha Tiwari', email: 'neha.tiwari@example.com', phone: '+919876543230', kyc: 'verified', accountType: 'credit_card', balanceBracket: '1L-5L', salaryBracket: '50K-1L', cityTier: 'tier1' },
  { id: 'CUST_022', name: 'Rohan Das', email: 'rohan.das@example.com', phone: '+919876543231', kyc: 'verified', accountType: 'savings', balanceBracket: '5L-25L', salaryBracket: '1L+', cityTier: 'tier1' },
  { id: 'CUST_023', name: 'Swati Mishra', email: 'swati.mishra@example.com', phone: '+919876543232', kyc: 'pending', accountType: 'savings', balanceBracket: '0-10K', salaryBracket: '0-25K', cityTier: 'tier3' },
  { id: 'CUST_024', name: 'Manish Saxena', email: 'manish.saxena@example.com', phone: '+919876543233', kyc: 'verified', accountType: 'loan', balanceBracket: '10K-1L', salaryBracket: '25K-50K', cityTier: 'tier2' },
  { id: 'CUST_025', name: 'Geeta Rao', email: 'geeta.rao@example.com', phone: '+919876543234', kyc: 'verified', accountType: 'savings', balanceBracket: '25L+', salaryBracket: '1L+', cityTier: 'tier1' },
]

// ============ HELPERS ============

function randomDate(daysAgo: number): string {
  // API rejects events > 7 days old, so cap to 6 days to stay safe
  const cappedDays = Math.min(daysAgo, 6)
  const d = new Date()
  d.setDate(d.getDate() - Math.floor(Math.random() * cappedDays))
  d.setHours(Math.floor(Math.random() * 24), Math.floor(Math.random() * 60))
  return d.toISOString()
}

function randomAmount(min: number, max: number): number {
  // Returns amount in paise
  return Math.floor(Math.random() * (max - min) + min) * 100
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

async function apiPost(path: string, body: unknown, headers?: Record<string, string>): Promise<Record<string, any>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const data = await res.json() as Record<string, any>
  if (!res.ok) {
    throw new Error(`${res.status} ${path}: ${JSON.stringify(data)}`)
  }
  return data
}

async function apiGet(path: string): Promise<Record<string, any>> {
  const res = await fetch(`${BASE_URL}${path}`)
  return res.json() as Promise<Record<string, any>>
}

// ============ MAIN ============

async function seed() {
  console.log('🏦 Starting fintech demo seed...\n')
  console.log(`API Base: ${BASE_URL}\n`)

  // ─── Step 1: Create project via onboarding API ───
  console.log('Step 1: Creating fintech project...')
  const projectRes = await apiPost('/api/onboarding/projects', {
    name: 'Demo Bank (Storees Fintech)',
    domain_type: 'fintech',
  })

  const { project, api_keys } = projectRes.data
  console.log(`  ✓ Project: ${project.name} (${project.id})`)
  console.log(`  ✓ Domain: ${project.domain_type}`)
  console.log(`  ✓ API Key: ${api_keys.key_public}`)
  console.log(`  ✓ API Secret: ${api_keys.key_secret.slice(0, 20)}...`)

  const authHeaders = {
    'X-API-Key': api_keys.key_public,
    'X-API-Secret': api_keys.key_secret,
  }

  // ─── Step 2: Upsert customers ───
  console.log('\nStep 2: Creating customers...')
  let customerCount = 0
  for (const c of FINTECH_CUSTOMERS) {
    await apiPost('/api/v1/customers', {
      customer_id: c.id,
      attributes: {
        email: c.email,
        phone: c.phone,
        name: c.name,
        kyc_status: c.kyc,
        account_type: c.accountType,
        balance_bracket: c.balanceBracket,
        salary_bracket: c.salaryBracket,
        city_tier: c.cityTier,
      },
    }, authHeaders)
    customerCount++
  }
  console.log(`  ✓ Created ${customerCount} customers`)

  // ─── Step 3: Fire events ───
  console.log('\nStep 3: Sending events...')
  let eventCount = 0
  const channels = ['upi', 'neft', 'imps', 'card']
  const billTypes = ['electricity', 'mobile_recharge', 'dth', 'water', 'broadband', 'insurance_premium']

  for (const c of FINTECH_CUSTOMERS) {
    // --- Transactions (3-15 per customer based on profile) ---
    const txnCount = c.balanceBracket === '25L+' ? 15 :
                     c.balanceBracket === '5L-25L' ? 10 :
                     c.balanceBracket === '1L-5L' ? 7 :
                     c.balanceBracket === '10K-1L' ? 4 : 2

    for (let i = 0; i < txnCount; i++) {
      const channel = randomChoice(channels)
      const type = Math.random() > 0.4 ? 'debit' : 'credit'
      const amount = type === 'debit'
        ? randomAmount(100, 50000) // 100-50000 INR in paise
        : randomAmount(5000, 200000)

      await apiPost('/api/v1/events', {
        event_name: 'transaction_completed',
        customer_id: c.id,
        timestamp: randomDate(30),
        idempotency_key: `txn_${c.id}_${i}`,
        properties: {
          transaction_id: `TXN_${c.id}_${i}`,
          type,
          channel,
          amount,
          currency: 'INR',
          merchant: type === 'debit' ? randomChoice(['Swiggy', 'Amazon', 'Flipkart', 'BigBasket', 'Uber', 'PhonePe', 'GPay']) : 'Salary Credit',
          status: 'completed',
        },
        entities: [{
          type: 'transaction',
          external_id: `TXN_${c.id}_${i}`,
          status: 'completed',
          attributes: { type, channel, amount, currency: 'INR' },
        }],
      }, authHeaders)
      eventCount++
    }

    // --- App login events (1-5 per customer) ---
    const loginCount = Math.floor(Math.random() * 5) + 1
    for (let i = 0; i < loginCount; i++) {
      await apiPost('/api/v1/events', {
        event_name: 'app_login',
        customer_id: c.id,
        timestamp: randomDate(7),
        properties: {
          platform: randomChoice(['android', 'ios', 'web']),
          session_duration_seconds: Math.floor(Math.random() * 600) + 30,
        },
      }, authHeaders)
      eventCount++
    }

    // --- Bill payments (for verified customers) ---
    if (c.kyc === 'verified' && Math.random() > 0.4) {
      const billCount = Math.floor(Math.random() * 3) + 1
      for (let i = 0; i < billCount; i++) {
        const billType = randomChoice(billTypes)
        await apiPost('/api/v1/events', {
          event_name: 'bill_payment_completed',
          customer_id: c.id,
          timestamp: randomDate(30),
          properties: {
            bill_type: billType,
            amount: randomAmount(200, 5000),
            biller_name: `${billType.replace('_', ' ')} provider`,
            payment_method: 'upi',
          },
        }, authHeaders)
        eventCount++
      }
    }

    // --- KYC events ---
    if (c.kyc === 'verified') {
      await apiPost('/api/v1/events', {
        event_name: 'kyc_verified',
        customer_id: c.id,
        timestamp: randomDate(60),
        properties: { method: randomChoice(['aadhaar_otp', 'digilocker', 'video_kyc']), tier: 'full' },
      }, authHeaders)
      eventCount++
    } else if (c.kyc === 'expired') {
      await apiPost('/api/v1/events', {
        event_name: 'kyc_expired',
        customer_id: c.id,
        timestamp: randomDate(10),
        properties: { original_verification_date: randomDate(400), reason: 'periodic_review' },
      }, authHeaders)
      eventCount++
    }

    // --- Loan events (for loan account types + some others) ---
    if (c.accountType === 'loan' || (c.kyc === 'verified' && Math.random() > 0.7)) {
      const loanType = randomChoice(['personal', 'home', 'vehicle', 'education'])
      const loanAmount = randomAmount(50000, 2000000)

      await apiPost('/api/v1/events', {
        event_name: 'loan_disbursed',
        customer_id: c.id,
        timestamp: randomDate(90),
        properties: {
          loan_id: `LOAN_${c.id}`,
          loan_type: loanType,
          principal: loanAmount,
          tenure_months: randomChoice([12, 24, 36, 60]),
          interest_rate_bps: randomChoice([850, 1050, 1250, 1450]),
        },
        entities: [{
          type: 'loan',
          external_id: `LOAN_${c.id}`,
          status: 'active',
          attributes: { loan_type: loanType, principal: loanAmount },
        }],
      }, authHeaders)
      eventCount++

      // EMI events
      const emiCount = Math.floor(Math.random() * 4) + 1
      for (let i = 0; i < emiCount; i++) {
        const overdue = c.accountType === 'loan' && i === emiCount - 1 && Math.random() > 0.5
        await apiPost('/api/v1/events', {
          event_name: overdue ? 'emi_overdue' : 'emi_paid',
          customer_id: c.id,
          timestamp: randomDate(30 * (emiCount - i)),
          properties: {
            loan_id: `LOAN_${c.id}`,
            emi_number: i + 1,
            amount: Math.floor(loanAmount / 36),
            ...(overdue ? { days_overdue: Math.floor(Math.random() * 30) + 1 } : {}),
          },
        }, authHeaders)
        eventCount++
      }
    }

    // --- SIP/Investment events (for demat accounts + high balance) ---
    if (c.accountType === 'demat' || c.balanceBracket === '25L+') {
      const sipType = randomChoice(['equity', 'mutual_fund'])
      await apiPost('/api/v1/events', {
        event_name: 'sip_started',
        customer_id: c.id,
        timestamp: randomDate(90),
        properties: {
          sip_id: `SIP_${c.id}`,
          fund_name: randomChoice(['HDFC Top 100', 'SBI Bluechip', 'Axis Midcap', 'Mirae Asset Large Cap', 'Parag Parikh Flexi Cap']),
          sip_amount: randomChoice([500000, 1000000, 2500000, 500000]),
          frequency: 'monthly',
          type: sipType,
        },
        entities: [{
          type: 'sip',
          external_id: `SIP_${c.id}`,
          status: 'active',
          attributes: { type: sipType },
        }],
      }, authHeaders)
      eventCount++

      // SIP executions
      const execCount = Math.floor(Math.random() * 6) + 1
      for (let i = 0; i < execCount; i++) {
        await apiPost('/api/v1/events', {
          event_name: 'sip_executed',
          customer_id: c.id,
          timestamp: randomDate(30 * (execCount - i)),
          properties: {
            sip_id: `SIP_${c.id}`,
            execution_number: i + 1,
            nav: (Math.random() * 100 + 20).toFixed(2),
            units_allotted: (Math.random() * 50 + 5).toFixed(4),
          },
        }, authHeaders)
        eventCount++
      }
    }

    // --- Card activation (for credit card holders) ---
    if (c.accountType === 'credit_card') {
      await apiPost('/api/v1/events', {
        event_name: 'card_activated',
        customer_id: c.id,
        timestamp: randomDate(60),
        properties: {
          card_type: 'credit',
          card_network: randomChoice(['visa', 'mastercard', 'rupay']),
          credit_limit: randomAmount(50000, 500000),
        },
      }, authHeaders)
      eventCount++
    }

    // Progress indicator
    if (customerCount > 0 && FINTECH_CUSTOMERS.indexOf(c) % 5 === 4) {
      console.log(`  ... processed ${FINTECH_CUSTOMERS.indexOf(c) + 1}/${FINTECH_CUSTOMERS.length} customers (${eventCount} events so far)`)
    }
  }
  console.log(`  ✓ Sent ${eventCount} events total`)

  // ─── Step 4: Verify integration status ───
  console.log('\nStep 4: Checking integration status...')
  const status = await apiGet(`/api/onboarding/projects/${project.id}/integration-status`)
  const statusData = status.data
  console.log(`  Status: ${statusData.status}`)
  console.log(`  Total events: ${statusData.total_events}`)
  console.log(`  First event received: ${statusData.has_received_first_event}`)
  console.log('  Checklist:')
  for (const item of statusData.checklist) {
    console.log(`    ${item.done ? '✓' : '○'} ${item.label}`)
  }

  // ─── Summary ───
  console.log('\n' + '='.repeat(60))
  console.log('🎉 Fintech demo seed complete!\n')
  console.log(`Project ID:   ${project.id}`)
  console.log(`Domain:       ${project.domain_type}`)
  console.log(`Customers:    ${customerCount}`)
  console.log(`Events:       ${eventCount}`)
  console.log(`API Key:      ${api_keys.key_public}`)
  console.log(`API Secret:   ${api_keys.key_secret}`)
  console.log('')
  console.log('Set in frontend .env.local:')
  console.log(`  NEXT_PUBLIC_PROJECT_ID=${project.id}`)
  console.log('')
  console.log('Quick test with cURL:')
  console.log(`  curl -s ${BASE_URL}/api/onboarding/projects/${project.id}/integration-status | jq .`)
  console.log('')
  console.log('Send a manual event:')
  console.log(`  curl -X POST ${BASE_URL}/api/v1/events \\`)
  console.log(`    -H "Content-Type: application/json" \\`)
  console.log(`    -H "X-API-Key: ${api_keys.key_public}" \\`)
  console.log(`    -H "X-API-Secret: ${api_keys.key_secret}" \\`)
  console.log(`    -d '{"event_name":"transaction_completed","customer_id":"CUST_001","properties":{"type":"debit","channel":"upi","amount":150000}}'`)
}

seed().catch(err => {
  console.error('\n❌ Seed failed:', err.message ?? err)
  process.exit(1)
})
