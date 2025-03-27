# Prostore

A full featured Ecommerce website built with Next.js, Next Auth, PostgreSQL, Prisma ORM, TypeScript, Zod, ShadCN UI, React Hook Form and tested with Jest.

<img src="/public/images/screen.png" alt="Next.js Ecommerce" />

## Features

- Next Auth authentication
- Admin area with stats & chart using Recharts
- Order, product and user management
- User area with profile and orders
- Stripe API integration
- PayPal integration
- Cash on delivery option
- Interactive checkout process
- Featured products with banners
- Multiple images using Uploadthing
- Ratings & reviews system
- Search form (customer & admin)
- Sorting, filtering & pagination
- Dark/Light mode
- Jest Testing: unit testing for PayPal API to validate tokens and payment
- Vercel continuous deployment from GitHub
- Much more

Prostore uses the following technologies:

- [Next.js 15](https://nextjs.org/)
- [React 19](https://reactjs.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [PostgreSQL](https://www.postgresql.org/)
- [Prisma ORM](https://www.prisma.io/)
- [NextAuth.js](https://next-auth.js.org/): Local email password auth using bcrypt, easy to add magiclink and Google auth providers.
- [TypeScript](https://www.typescriptlang.org/)
- [Zod](https://zod.dev/): Type-safe programming and Zod schemas for validating data before saving to database.
- [ShadCN UI](https://ui.shadcn.com/): Pick and choose components to use, Tailwind CSS under-the-hood.
- [React Hook Form](https://react-hook-form.com/): Handle form state, validation, submission, works with Zod schemas to automatically handle validation in React.
- [React Toastify](https://fkhadra.github.io/react-toastify/)
- [Lucide Icon Library](https://lucide.dev/guide/packages/lucide-react)
- [Next Themes](https://github.com/pacocoursey/next-themes): an abstraction for themes in React apps
- [Neon Serverless Connection UI](https://github.com/neondatabase/serverless): Provides a low-level connection interface to interact with the Neon serverless PostgreSQL database using WebSockets. That's why we're also installing the websockets package. This adapter allows us to connect directly to Neon in serverless environments, such as Vercel or Netlify, where maintaining persistent connections to a database can be challenging.
- [Neon Prisma Adapter](https://github.com/prisma/prisma): This is an adapter specifically for Prisma to ensure Prisma can operate smoothly with Neon in serverless environments. Prisma by default assumes traditional database connections (over TCP), so this adapter adapts Prisma’s behavior to Neon’s serverless infrastructure, which uses WebSockets and connection pooling.
- [WebSockets Library](https://github.com/websockets/ws): This is a WebSocket library used by the Neon adapter to establish and manage connections to the Neon serverless database.
- [WS Types](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/ws): This package contains type definitions for WebSockets.
- [Bufferutil](https://github.com/websockets/bufferutil): Makes WebSockets fast. It provides some utilities to efficiently perform some operations such as masking and unmasking the data payload of WebSocket frames.
- [BCrypt TS Edge](https://www.npmjs.com/package/bcrypt-ts-edge): Optimized bcrypt written in typescript modified for serverless environments like Vercel Edge
- [Prisma Adapter](https://authjs.dev/getting-started/adapters/prisma?framework=next-js)
- [Hookform Resolvers](https://github.com/react-hook-form/resolvers): This package provides integrations between react-hook-form and validation libraries like zod. It enables react-hook-form to leverage the validation schemas from these libraries directly, making it simpler to apply custom validation rules. This way we don't have to write custom validation functions.
- [Jest](https://jestjs.io/): JavaScript Testing Framework.
- [TS Jest](https://kulshekhar.github.io/ts-jest/): Jest transformer with source map support that lets you use Jest to test projects written in TypeScript.
- [TS Node](https://github.com/DefinitelyTyped/DefinitelyTyped): Type definitions for node.
- [DotEnv](https://github.com/motdotla/dotenv): Module that loads environment variables from a .env file into process.env.
- [React Paypal JS](https://paypal.github.io/react-paypal-js/): Abstract away complexities around loading the PayPal JS SDK scripts.
- [Query String](https://github.com/sindresorhus/query-string): Parse and stringify URL query strings.
- [Recharts](https://recharts.org/): A composable charting library built on React components.
- [Slugify](https://github.com/simov/slugify): Slugifies a string.
- [Uploadthing](https://uploadthing.com/): File uploads for developers. Library provides middleware support, file type validation, custom metadata.
- [Uploadthing React](https://docs.uploadthing.com/getting-started/appdir#install-the-packages): Packages for react and nextjs to use uploadthing.
- [Embla Carousel Autoplay](https://www.embla-carousel.com/): A bare bones carousel library with great fluid motion and awesome swipe precision.
- [Stripe](https://github.com/stripe/stripe-node): The Stripe Node library provides convenient access to the Stripe API from applications written in server-side JavaScript.
- [Stripe JS](https://stripe.com/docs/js): This package allows Stripe.js to be imported as a CommonJS (CJS) module or ES module (ESM).
- [React Stripe JS](https://github.com/stripe/react-stripe-js): React components for Stripe.js and Elements.
- [Resend Node.js SDK](https://github.com/resendlabs/resend-node): Node.js library for the Resend API.
- [React Email](https://github.com/resend/react-email): A collection of high-quality, unstyled components for creating beautiful emails using React and TypeScript. It reduces the pain of coding responsive emails with dark mode support. It also takes care of inconsistencies between Gmail, Outlook, and other email clients for you.
- [React Email Components](https://github.com/resend/react-email): A collection of all components React Email.
