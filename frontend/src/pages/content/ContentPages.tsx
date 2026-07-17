import { useState } from 'react';
import { Seo } from '../../components/Seo';

function Page({
  title,
  description,
  path,
  children,
}: {
  title: string;
  description: string;
  path: string;
  children: React.ReactNode;
}) {
  return (
    <div className="container-app py-10">
      <Seo title={title} description={description} canonicalPath={path} />
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-extrabold">{title}</h1>
        <div className="prose mt-6 space-y-4 text-ink-muted [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-ink">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AboutPage() {
  return (
    <Page
      title="About TSG eCart"
      description="TSG eCart delivers fresh groceries fast across Hyderabad."
      path="/about"
    >
      <p>
        TSG eCart is a quick-commerce grocery platform built to bring fresh produce, dairy, snacks
        and daily essentials to your door across Hyderabad — often in under 30 minutes.
      </p>
      <h2>Our promise</h2>
      <p>
        Handpicked quality, honest pricing, and lightning-fast delivery. We partner with trusted
        suppliers so that every order arrives fresh and on time.
      </p>
      <h2>Where we deliver</h2>
      <p>
        We currently serve Hyderabad, Telangana, and are expanding to new neighbourhoods every week.
      </p>
    </Page>
  );
}

export function ContactPage() {
  const [sent, setSent] = useState(false);
  return (
    <Page
      title="Contact us"
      description="Get in touch with the TSG eCart support team."
      path="/contact"
    >
      <p>We'd love to hear from you. Reach us any day between 8 AM and 11 PM.</p>
      <ul className="list-none space-y-1">
        <li>📧 support@tsgecart.com</li>
        <li>📞 +91 90000 00000</li>
        <li>📍 Hyderabad, Telangana, India</li>
      </ul>
      {sent ? (
        <p className="rounded-xl bg-brand-50 p-4 text-ink">
          Thanks for reaching out — we'll get back to you shortly.
        </p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSent(true);
          }}
          className="not-prose space-y-3"
        >
          <input required placeholder="Your name" className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm" />
          <input required type="email" placeholder="Your email" className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm" />
          <textarea required rows={4} placeholder="How can we help?" className="w-full rounded-xl border border-black/10 px-4 py-2.5 text-sm" />
          <button className="btn-primary">Send message</button>
        </form>
      )}
    </Page>
  );
}

const FAQS = [
  { q: 'Where does TSG eCart deliver?', a: 'We currently deliver within Hyderabad, Telangana. Enter your pincode at checkout to confirm serviceability.' },
  { q: 'How fast is delivery?', a: 'Most orders arrive in 10–45 minutes depending on your delivery zone and order size.' },
  { q: 'What payment methods are accepted?', a: 'We accept Cash on Delivery and online payments (UPI, cards, netbanking) via Razorpay. You can also pay using your wallet balance.' },
  { q: 'Can I cancel my order?', a: 'Orders can be cancelled while they are in the Confirmed or Preparing stage. Cancellations restock items automatically.' },
  { q: 'How do referral rewards work?', a: 'Share your referral code. When your friend places their first order, both of you earn wallet credits.' },
];

export function FaqPage() {
  return (
    <Page title="Frequently asked questions" description="Answers to common questions about TSG eCart." path="/faq">
      <div className="not-prose space-y-3">
        {FAQS.map((f) => (
          <details key={f.q} className="rounded-xl border border-black/10 p-4">
            <summary className="cursor-pointer font-semibold text-ink">{f.q}</summary>
            <p className="mt-2 text-sm text-ink-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </Page>
  );
}

export function PrivacyPage() {
  return (
    <Page title="Privacy Policy" description="How TSG eCart collects and uses your data." path="/privacy">
      <p>Last updated: {new Date().getFullYear()}</p>
      <h2>Information we collect</h2>
      <p>We collect your name, email, phone, delivery addresses and order history to provide and improve our service.</p>
      <h2>How we use it</h2>
      <p>To process orders, deliver products, send order updates, and personalise your experience. We never sell your data.</p>
      <h2>Payment security</h2>
      <p>Payments are processed securely by Razorpay. We do not store card details on our servers.</p>
      <h2>Your rights</h2>
      <p>You may request access to, or deletion of, your personal data by contacting support@tsgecart.com.</p>
    </Page>
  );
}

export function TermsPage() {
  return (
    <Page title="Terms & Conditions" description="Terms governing the use of TSG eCart." path="/terms">
      <p>By using TSG eCart you agree to these terms.</p>
      <h2>Orders</h2>
      <p>All orders are subject to product availability and serviceability of your delivery pincode.</p>
      <h2>Pricing</h2>
      <p>Prices are inclusive of applicable taxes. Delivery charges are shown at checkout and depend on your zone and order value.</p>
      <h2>Accounts</h2>
      <p>You are responsible for maintaining the confidentiality of your account credentials.</p>
    </Page>
  );
}

export function RefundPage() {
  return (
    <Page title="Refund Policy" description="TSG eCart refund and returns policy." path="/refunds">
      <h2>Damaged or incorrect items</h2>
      <p>If an item arrives damaged, spoiled or incorrect, report it within 24 hours for a full refund or replacement.</p>
      <h2>Refund method</h2>
      <p>Online payments are refunded to the original payment method within 5–7 business days. Cash on Delivery refunds are credited to your TSG eCart wallet.</p>
      <h2>Cancellations</h2>
      <p>Orders cancelled before dispatch are refunded in full.</p>
    </Page>
  );
}
