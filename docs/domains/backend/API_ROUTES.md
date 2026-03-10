# Backend — API Routes

> **Base URL**: `http://localhost:3001/api` (dev) or `https://api.storees.io/api` (prod)
> **Auth**: All routes require `Authorization: Bearer {session_token}` except webhooks
> **Format**: JSON request/response. All responses wrapped in `ApiResponse<T>` or `PaginatedResponse<T>`

## Route Map

### Projects & Integration
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/projects/current` | `getProject` | Get current project details |
| `GET` | `/integrations/shopify/install` | `shopifyInstall` | Initiate Shopify OAuth redirect |
| `GET` | `/integrations/shopify/callback` | `shopifyCallback` | Handle OAuth callback, store token |
| `GET` | `/integrations/shopify/status` | `shopifyStatus` | Check connection + sync status |
| `POST` | `/integrations/shopify/sync` | `shopifySync` | Trigger historical data sync |
| `POST` | `/webhooks/shopify/:projectId` | `shopifyWebhook` | Receive Shopify webhooks (no auth, HMAC verified) |

### Customers
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/customers` | `listCustomers` | Paginated list with search/sort/filter |
| `GET` | `/customers/:id` | `getCustomer` | Full customer profile |
| `GET` | `/customers/:id/orders` | `getCustomerOrders` | Customer's order history |
| `GET` | `/customers/:id/events` | `getCustomerEvents` | Customer's event timeline |

#### Query Parameters for `GET /customers`
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `projectId` | string | required | Multi-tenant filter |
| `page` | number | `1` | Page number |
| `pageSize` | number | `25` | Items per page (max 100) |
| `search` | string | — | Search name, email, phone (ILIKE) |
| `sortBy` | string | `lastSeen` | `lastSeen` \| `totalSpent` \| `clv` \| `name` |
| `sortOrder` | string | `desc` | `asc` \| `desc` |
| `segmentId` | string | — | Filter by segment membership |

### Segments
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/segments` | `listSegments` | All segments for project |
| `POST` | `/segments` | `createSegment` | Create custom segment |
| `POST` | `/segments/from-template` | `createFromTemplate` | Create from default template |
| `POST` | `/segments/preview` | `previewSegment` | Get matching count for filter rules |
| `GET` | `/segments/lifecycle` | `getLifecycleChart` | RFM lifecycle chart data |
| `GET` | `/segments/:id` | `getSegment` | Single segment details |
| `PUT` | `/segments/:id` | `updateSegment` | Update segment filters/name |
| `DELETE` | `/segments/:id` | `deleteSegment` | Delete (warns if active flows exist) |
| `GET` | `/segments/:id/members` | `getSegmentMembers` | Paginated member list |

#### Request Body for `POST /segments`
```json
{
  "projectId": "uuid",
  "name": "Big Spenders",
  "description": "Customers who spent over ₹10,000",
  "filters": {
    "logic": "AND",
    "rules": [
      { "field": "total_spent", "operator": "greater_than", "value": 10000 }
    ]
  }
}
```

#### Request Body for `POST /segments/from-template`
```json
{
  "projectId": "uuid",
  "templateName": "champion_customers"
}
```

### Flows
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/flows` | `listFlows` | All flows for project |
| `GET` | `/flows/templates` | `getFlowTemplates` | Available flow templates |
| `POST` | `/flows` | `createFlow` | Create new flow |
| `POST` | `/flows/from-template` | `createFlowFromTemplate` | Create from template |
| `GET` | `/flows/:id` | `getFlow` | Single flow with nodes |
| `PUT` | `/flows/:id` | `updateFlow` | Update flow config/nodes |
| `POST` | `/flows/:id/start` | `startFlow` | Activate flow |
| `POST` | `/flows/:id/stop` | `stopFlow` | Pause/stop flow |
| `GET` | `/flows/:id/trips` | `getFlowTrips` | Trip analytics |

### Dashboard & Events
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `GET` | `/dashboard/metrics` | `getDashboardMetrics` | Key metrics for dashboard |
| `GET` | `/events/stream` | `getEventStream` | Recent events for debugger |

#### Query Parameters for `GET /events/stream`
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `projectId` | string | required | |
| `limit` | number | `50` | Max events to return |
| `after` | string (ISO date) | — | Events after this timestamp |

### AI
| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| `POST` | `/ai/segment` | `generateSegmentFilter` | Convert natural language to FilterConfig |

#### Request Body for `POST /ai/segment`
```json
{
  "input": "customers who spent more than 5000 rupees in the last 30 days",
  "history": [
    { "role": "user", "text": "previous message" },
    { "role": "assistant", "text": "{...previous FilterConfig...}" }
  ]
}
```

#### Response for `POST /ai/segment`
```json
{
  "success": true,
  "data": {
    "filters": {
      "logic": "AND",
      "rules": [
        { "field": "totalSpent", "operator": "greater_than", "value": 500000 },
        { "field": "daysSinceLastOrder", "operator": "less_than", "value": 30 }
      ]
    },
    "summary": "Customers who spent over ₹5,000 in the last 30 days"
  }
}
```

---

## Error Response Format

All errors follow this shape:
```json
{
  "success": false,
  "error": "Human-readable error message",
  "code": "SEGMENT_HAS_ACTIVE_FLOWS",
  "details": { "flowCount": 3 }
}
```

### Error Codes
| Code | HTTP | Description |
|------|------|-------------|
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `SHOPIFY_NOT_CONNECTED` | 400 | No Shopify store connected |
| `SHOPIFY_SYNC_IN_PROGRESS` | 409 | Historical sync already running |
| `SEGMENT_HAS_ACTIVE_FLOWS` | 409 | Cannot delete segment used by active flows |
| `FLOW_ALREADY_ACTIVE` | 409 | Flow is already running |
| `DUPLICATE_TRIP` | 409 | Customer already has an active trip in this flow |
