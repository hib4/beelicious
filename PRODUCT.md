# Beelicious product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users and purpose

Indonesian food customers discover tenants and order through a guided WhatsApp conversation. The marketing website explains the platform and invites approved pilot users to open WhatsApp. Beelicious is not a restaurant, kitchen, or delivery operator.

## Stack

Next.js App Router marketing frontend in apps/web; existing Fastify modular monolith remains the business API. TypeScript and npm workspaces. No web checkout or direct frontend database access.

## Capabilities and constraints

Persistent numeric conversation, catalog, cart, pickup scheduling, Mock and Midtrans Sandbox checkout exist. Messaging is currently restricted to explicitly approved test contacts. Baileys is active for development; Cloud API and Mock remain supported. No production collection or public launch is authorized.

## Brand commitments

Use DESIGN.md, the supplied beelicious.png unchanged, Indonesian copy, accessible navigation, reduced motion, and configurable WhatsApp CTAs. No invented merchant claims, photography, ratings, or addresses.

## Evidence on hand

Warung Babe is the supplied pilot example. Menu entries and operating hours are development fixtures, not verified commercial information. No authentic merchant photography, finalized wordmark, public contact, or production site origin has been supplied.

## Product principles

Keep ordering in WhatsApp. Show service readiness honestly. Protect backend credentials and private sessions. Preserve the existing backend. Keep public ordering disabled unless deliberately configured for invited testers.
