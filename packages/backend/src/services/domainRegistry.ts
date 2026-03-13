import type { DomainType, DomainConfig, DomainFieldDef, FilterOperator } from '@storees/shared'

// ============ ECOMMERCE DOMAIN ============

const ecommerceFields: DomainFieldDef[] = [
  // Customer Info
  { field: 'email', label: 'Email', type: 'string', category: 'Customer Info', operators: ['is', 'is_not', 'contains', 'begins_with', 'ends_with'] as FilterOperator[] },
  { field: 'name', label: 'Name', type: 'string', category: 'Customer Info', operators: ['is', 'is_not', 'contains'] as FilterOperator[] },
  { field: 'phone', label: 'Phone', type: 'string', category: 'Customer Info', operators: ['is', 'is_not'] as FilterOperator[] },
  { field: 'city', label: 'City', type: 'string', category: 'Customer Info', operators: ['is', 'is_not'] as FilterOperator[] },
  { field: 'email_subscribed', label: 'Email Subscribed', type: 'boolean', category: 'Customer Info', operators: ['is_true', 'is_false'] as FilterOperator[] },

  // Purchase History
  { field: 'total_orders', label: 'Total Orders', type: 'number', category: 'Purchase History', operators: ['is', 'greater_than', 'less_than', 'between'] as FilterOperator[], metricKey: 'total_orders' },
  { field: 'total_spent', label: 'Total Spent', type: 'number', category: 'Purchase History', operators: ['is', 'greater_than', 'less_than', 'between'] as FilterOperator[], metricKey: 'total_spent' },
  { field: 'avg_order_value', label: 'Avg Order Value', type: 'number', category: 'Purchase History', operators: ['greater_than', 'less_than'] as FilterOperator[], metricKey: 'avg_order_value' },
  { field: 'clv', label: 'Customer Lifetime Value', type: 'number', category: 'Purchase History', operators: ['greater_than', 'less_than'] as FilterOperator[], metricKey: 'clv' },

  // Engagement
  { field: 'days_since_last_order', label: 'Days Since Last Order', type: 'number', category: 'Engagement', operators: ['greater_than', 'less_than', 'is'] as FilterOperator[], metricKey: 'days_since_last_order' },
  { field: 'first_order_date', label: 'First Order Date', type: 'date', category: 'Engagement', operators: ['before_date', 'after_date'] as FilterOperator[] },

  // Product Filters
  { field: 'product_name', label: 'Product', type: 'product', category: 'Product Filters', operators: ['has_purchased', 'has_not_purchased'] as FilterOperator[] },
  { field: 'collection_name', label: 'Collection', type: 'collection', category: 'Product Filters', operators: ['has_purchased', 'has_not_purchased'] as FilterOperator[] },
]

const ecommerceDomain: DomainConfig = {
  domainType: 'ecommerce',
  fields: ecommerceFields,
  channels: ['email'],
}

// ============ FINTECH DOMAIN ============

const fintechFields: DomainFieldDef[] = [
  // Customer Info
  { field: 'email', label: 'Email', type: 'string', category: 'Customer Info', operators: ['is', 'is_not', 'contains'] as FilterOperator[] },
  { field: 'name', label: 'Name', type: 'string', category: 'Customer Info', operators: ['is', 'is_not', 'contains'] as FilterOperator[] },
  { field: 'phone', label: 'Phone', type: 'string', category: 'Customer Info', operators: ['is', 'is_not'] as FilterOperator[] },
  { field: 'kyc_status', label: 'KYC Status', type: 'select', category: 'Customer Info', operators: ['is', 'is_not'] as FilterOperator[], options: ['verified', 'pending', 'expired'] },
  { field: 'city_tier', label: 'City Tier', type: 'select', category: 'Customer Info', operators: ['is'] as FilterOperator[], options: ['tier1', 'tier2', 'tier3'] },
  { field: 'age_group', label: 'Age Group', type: 'select', category: 'Customer Info', operators: ['is'] as FilterOperator[], options: ['18-25', '25-35', '35-50', '50+'] },

  // Transaction History
  { field: 'total_transactions', label: 'Total Transactions', type: 'number', category: 'Transaction History', operators: ['is', 'greater_than', 'less_than', 'between'] as FilterOperator[], metricKey: 'total_transactions' },
  { field: 'total_debit', label: 'Total Debit (paise)', type: 'number', category: 'Transaction History', operators: ['greater_than', 'less_than'] as FilterOperator[], metricKey: 'total_debit' },
  { field: 'total_credit', label: 'Total Credit (paise)', type: 'number', category: 'Transaction History', operators: ['greater_than', 'less_than'] as FilterOperator[], metricKey: 'total_credit' },
  { field: 'avg_transaction_value', label: 'Avg Transaction Value', type: 'number', category: 'Transaction History', operators: ['greater_than', 'less_than'] as FilterOperator[], metricKey: 'avg_transaction_value' },
  { field: 'transaction_channel', label: 'Primary Channel', type: 'select', category: 'Transaction Filters', operators: ['is', 'is_not'] as FilterOperator[], options: ['upi', 'neft', 'imps', 'card', 'cash'] },

  // Account Info
  { field: 'account_type', label: 'Account Type', type: 'select', category: 'Account Info', operators: ['is', 'is_not'] as FilterOperator[], options: ['savings', 'current', 'fd', 'rd', 'loan', 'demat', 'credit_card'] },
  { field: 'balance_bracket', label: 'Balance Bracket', type: 'select', category: 'Account Info', operators: ['is'] as FilterOperator[], options: ['0-10K', '10K-1L', '1L-5L', '5L-25L', '25L+'] },
  { field: 'salary_bracket', label: 'Salary Bracket', type: 'select', category: 'Account Info', operators: ['is'] as FilterOperator[], options: ['0-25K', '25K-50K', '50K-1L', '1L+'] },

  // Engagement
  { field: 'days_since_last_txn', label: 'Days Since Last Transaction', type: 'number', category: 'Engagement', operators: ['greater_than', 'less_than', 'is'] as FilterOperator[], metricKey: 'days_since_last_txn' },
  { field: 'lifecycle_stage', label: 'Lifecycle Stage', type: 'select', category: 'Engagement', operators: ['is', 'is_not'] as FilterOperator[], options: ['new', 'active', 'at_risk', 'dormant', 'churned'], metricKey: 'lifecycle_stage' },

  // Lending
  { field: 'emi_overdue', label: 'EMI Overdue', type: 'boolean', category: 'Lending', operators: ['is_true', 'is_false'] as FilterOperator[], metricKey: 'emi_overdue' },
  { field: 'active_loans', label: 'Active Loans', type: 'number', category: 'Lending', operators: ['is', 'greater_than', 'less_than'] as FilterOperator[], metricKey: 'active_loans' },
  { field: 'loan_type', label: 'Loan Type', type: 'select', category: 'Lending', operators: ['is', 'is_not'] as FilterOperator[], options: ['personal', 'home', 'vehicle', 'education', 'gold', 'business'] },

  // Investment
  { field: 'investment_type', label: 'Investment Type', type: 'select', category: 'Investment', operators: ['is', 'is_not'] as FilterOperator[], options: ['equity', 'mutual_fund', 'sip', 'fd', 'rd'] },
  { field: 'portfolio_value', label: 'Portfolio Value (paise)', type: 'number', category: 'Investment', operators: ['greater_than', 'less_than'] as FilterOperator[], metricKey: 'portfolio_value' },
  { field: 'active_sips', label: 'Active SIPs', type: 'number', category: 'Investment', operators: ['is', 'greater_than'] as FilterOperator[], metricKey: 'active_sips' },

  // Card
  { field: 'card_type', label: 'Card Type', type: 'select', category: 'Card', operators: ['is', 'is_not'] as FilterOperator[], options: ['credit', 'debit'] },
]

const fintechDomain: DomainConfig = {
  domainType: 'fintech',
  fields: fintechFields,
  channels: ['email', 'sms', 'push', 'whatsapp'],
}

// ============ SaaS DOMAIN ============

const saasFields: DomainFieldDef[] = [
  { field: 'email', label: 'Email', type: 'string', category: 'Customer Info', operators: ['is', 'is_not', 'contains'] as FilterOperator[] },
  { field: 'name', label: 'Name', type: 'string', category: 'Customer Info', operators: ['is', 'is_not', 'contains'] as FilterOperator[] },
  { field: 'plan', label: 'Plan', type: 'select', category: 'Subscription', operators: ['is', 'is_not'] as FilterOperator[], options: ['free', 'starter', 'pro', 'enterprise'], metricKey: 'plan' },
  { field: 'mrr', label: 'MRR (cents)', type: 'number', category: 'Subscription', operators: ['greater_than', 'less_than'] as FilterOperator[], metricKey: 'mrr' },
  { field: 'days_since_signup', label: 'Days Since Signup', type: 'number', category: 'Engagement', operators: ['greater_than', 'less_than'] as FilterOperator[], metricKey: 'days_since_signup' },
  { field: 'feature_usage_count', label: 'Feature Usage Count', type: 'number', category: 'Engagement', operators: ['greater_than', 'less_than'] as FilterOperator[], metricKey: 'feature_usage_count' },
  { field: 'trial_status', label: 'Trial Status', type: 'select', category: 'Subscription', operators: ['is'] as FilterOperator[], options: ['in_trial', 'trial_expired', 'converted', 'no_trial'], metricKey: 'trial_status' },
]

const saasDomain: DomainConfig = {
  domainType: 'saas',
  fields: saasFields,
  channels: ['email', 'push'],
}

// ============ CUSTOM DOMAIN ============

const customFields: DomainFieldDef[] = [
  { field: 'email', label: 'Email', type: 'string', category: 'Customer Info', operators: ['is', 'is_not', 'contains'] as FilterOperator[] },
  { field: 'name', label: 'Name', type: 'string', category: 'Customer Info', operators: ['is', 'is_not', 'contains'] as FilterOperator[] },
  { field: 'phone', label: 'Phone', type: 'string', category: 'Customer Info', operators: ['is', 'is_not'] as FilterOperator[] },
]

const customDomain: DomainConfig = {
  domainType: 'custom',
  fields: customFields,
  channels: ['email'],
}

// ============ REGISTRY ============

const DOMAIN_REGISTRY: Record<DomainType, DomainConfig> = {
  ecommerce: ecommerceDomain,
  fintech: fintechDomain,
  saas: saasDomain,
  custom: customDomain,
}

/** Get domain configuration for a project's domain type. */
export function getDomainConfig(domainType: DomainType): DomainConfig {
  return DOMAIN_REGISTRY[domainType] ?? DOMAIN_REGISTRY.custom
}

/** Get all field definitions for a domain, optionally filtered by category. */
export function getDomainFields(domainType: DomainType, category?: string): DomainFieldDef[] {
  const config = getDomainConfig(domainType)
  if (category) {
    return config.fields.filter(f => f.category === category)
  }
  return config.fields
}

/** Get field categories for a domain (for UI grouping). */
export function getDomainCategories(domainType: DomainType): string[] {
  const config = getDomainConfig(domainType)
  return [...new Set(config.fields.map(f => f.category))]
}

/** Look up a single field definition. */
export function getFieldDef(domainType: DomainType, fieldName: string): DomainFieldDef | undefined {
  const config = getDomainConfig(domainType)
  return config.fields.find(f => f.field === fieldName)
}
