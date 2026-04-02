import React from 'react';

const brandAssets = {
  hubspot: { src: '/brands/hubspot.svg', alt: 'HubSpot' },
  slack: { src: '/brands/slack.svg', alt: 'Slack' },
  google: { src: '/brands/google.svg', alt: 'Google' },
  clearbit: { src: '/brands/clearbit.ico', alt: 'Clearbit' },
  calendly: { src: '/brands/calendly.svg', alt: 'Calendly' },
  zapier: { src: '/brands/zapier.svg', alt: 'Zapier' },
  salesforce: { src: '/brands/salesforce.svg', alt: 'Salesforce' },
  stripe: { src: '/brands/stripe.svg', alt: 'Stripe' },
  whatsapp: { src: '/brands/whatsapp.svg', alt: 'WhatsApp' },
};

function BrandLogo({ brand, size = 18, dimmed = false }) {
  const asset = brandAssets[brand];

  if (!asset) {
    return (
      <div
        className="integration-logo-fallback"
        style={{ width: size, height: size, opacity: dimmed ? 0.45 : 0.9 }}
      >
        {brand?.slice(0, 1).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={asset.src}
      alt={`${asset.alt} logo`}
      className="integration-logo"
      style={{ width: size, height: size, opacity: dimmed ? 0.45 : 0.92 }}
    />
  );
}

export default BrandLogo;
