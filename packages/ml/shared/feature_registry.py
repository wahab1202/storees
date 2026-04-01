"""Domain feature registry — maps abstract feature concepts to domain-specific events.

Each domain (ecommerce, fintech, saas) defines:
- Event mappings: which actual event names map to abstract concepts (purchase, cart, browse, etc.)
- Feature groups: which feature groups to compute
- Label overrides: special label logic for behavioral predictions
- Feature labels: human-readable names for SHAP explanations
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class DomainEventMap:
    """Maps abstract feature concepts to actual event names per domain."""
    purchase_events: list[str] = field(default_factory=list)
    cart_events: list[str] = field(default_factory=list)
    browse_events: list[str] = field(default_factory=list)
    session_events: list[str] = field(default_factory=list)
    email_events: list[str] = field(default_factory=list)
    pageview_events: list[str] = field(default_factory=list)
    channel_events: dict[str, list[str]] = field(default_factory=dict)
    custom_groups: dict[str, list[str]] = field(default_factory=dict)


@dataclass
class DomainConfig:
    domain: str
    event_map: DomainEventMap
    feature_groups: list[str] = field(default_factory=list)
    label_overrides: dict[str, str] = field(default_factory=dict)
    feature_labels: dict[str, str] = field(default_factory=dict)


def _build_registry() -> dict[str, DomainConfig]:
    """Build domain registry from domain modules. Lazy import to avoid circular deps."""
    from .domains.ecommerce import ECOMMERCE_CONFIG
    from .domains.fintech import FINTECH_CONFIG
    from .domains.saas import SAAS_CONFIG
    from .domains.edtech import EDTECH_CONFIG

    return {
        "ecommerce": ECOMMERCE_CONFIG,
        "fintech": FINTECH_CONFIG,
        "saas": SAAS_CONFIG,
        "edtech": EDTECH_CONFIG,
    }


_registry_cache: dict[str, DomainConfig] | None = None


def get_domain_config(domain: str) -> DomainConfig:
    """Get domain config, defaulting to ecommerce for unknown domains."""
    global _registry_cache
    if _registry_cache is None:
        _registry_cache = _build_registry()
    return _registry_cache.get(domain, _registry_cache["ecommerce"])


def get_domain_registry() -> dict[str, DomainConfig]:
    """Get full domain registry."""
    global _registry_cache
    if _registry_cache is None:
        _registry_cache = _build_registry()
    return _registry_cache
