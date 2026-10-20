import { PrismaClient, TeamRole } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seeds the database with realistic demo data so the API can be explored
 * immediately after `npm run seed`.
 *
 * Idempotent — uses upsert so it can be re-run safely without duplicates.
 */
async function main() {
  console.log('🌱 Seeding database...\n');

  // ── Users ───────────────────────────────────────────────────────────
  const alice = await prisma.user.upsert({
    where: { email: 'alice.chen@bluestaq.com' },
    update: {},
    create: { email: 'alice.chen@bluestaq.com', name: 'Alice Chen' },
  });

  const bob = await prisma.user.upsert({
    where: { email: 'bob.martinez@bluestaq.com' },
    update: {},
    create: { email: 'bob.martinez@bluestaq.com', name: 'Bob Martinez' },
  });

  const carol = await prisma.user.upsert({
    where: { email: 'carol.nguyen@bluestaq.com' },
    update: {},
    create: { email: 'carol.nguyen@bluestaq.com', name: 'Carol Nguyen' },
  });

  const dave = await prisma.user.upsert({
    where: { email: 'dave.johnson@bluestaq.com' },
    update: {},
    create: { email: 'dave.johnson@bluestaq.com', name: 'Dave Johnson' },
  });

  console.log(`  ✔ Users: ${alice.name}, ${bob.name}, ${carol.name}, ${dave.name}`);

  // ── Teams ───────────────────────────────────────────────────────────
  const backend = await prisma.team.upsert({
    where: { name: 'Backend Engineering' },
    update: {},
    create: {
      name: 'Backend Engineering',
      description: 'API design, database architecture, and service reliability',
    },
  });

  const platform = await prisma.team.upsert({
    where: { name: 'Platform Security' },
    update: {},
    create: {
      name: 'Platform Security',
      description: 'Zero-trust architecture, compliance, and vulnerability management',
    },
  });

  console.log(`  ✔ Teams: ${backend.name}, ${platform.name}`);

  // ── Team Memberships ────────────────────────────────────────────────
  const memberships = [
    { teamId: backend.id, userId: alice.id, role: TeamRole.ADMIN },
    { teamId: backend.id, userId: bob.id, role: TeamRole.MEMBER },
    { teamId: backend.id, userId: carol.id, role: TeamRole.MEMBER },
    { teamId: platform.id, userId: carol.id, role: TeamRole.ADMIN },
    { teamId: platform.id, userId: dave.id, role: TeamRole.MEMBER },
  ];

  for (const m of memberships) {
    await prisma.teamMember.upsert({
      where: { teamId_userId: { teamId: m.teamId, userId: m.userId } },
      update: {},
      create: m,
    });
  }

  console.log(`  ✔ Memberships: ${memberships.length} team-member links`);

  // ── Notes ───────────────────────────────────────────────────────────
  // Delete existing seeded notes so we can re-seed cleanly
  await prisma.note.deleteMany({
    where: {
      title: {
        in: [
          'API Design Principles',
          'Sprint Retro Action Items',
          'Database Indexing Cheat Sheet',
          'Personal Study Plan',
          'Incident Response Runbook',
          'Zero-Trust Network Segmentation',
        ],
      },
    },
  });

  const notes = await Promise.all([
    // Team notes — shared with Backend Engineering
    prisma.note.create({
      data: {
        title: 'API Design Principles',
        content: [
          '## RESTful API Guidelines',
          '',
          '1. Use nouns for resources, verbs for actions',
          '2. Return proper HTTP status codes (201 Created, 409 Conflict, etc.)',
          '3. Version your API from day one',
          '4. Use cursor-based pagination for large collections',
          '5. Document every endpoint with OpenAPI/Swagger',
          '',
          '> "APIs are like user interfaces — except your users are developers."',
        ].join('\n'),
        authorId: alice.id,
        teamId: backend.id,
      },
    }),

    prisma.note.create({
      data: {
        title: 'Sprint Retro Action Items',
        content: [
          '### What went well',
          '- OCC implementation landed with zero production incidents',
          '- Swagger docs auto-generation saved hours of documentation work',
          '',
          '### What to improve',
          '- [ ] Add cursor-based pagination before the data grows',
          '- [ ] Set up full-text search on notes (PostgreSQL tsvector)',
          '- [ ] Add rate limiting to public endpoints',
        ].join('\n'),
        authorId: bob.id,
        teamId: backend.id,
      },
    }),

    prisma.note.create({
      data: {
        title: 'Database Indexing Cheat Sheet',
        content: [
          '## When to add an index',
          '',
          '- Foreign keys used in JOINs → always index',
          '- Columns in WHERE clauses with high cardinality → index',
          '- Columns used in ORDER BY → consider a covering index',
          '',
          '## When NOT to index',
          '',
          '- Small tables (< 1000 rows) → sequential scan is faster',
          '- Columns with low cardinality (boolean flags)',
          '- Tables with heavy INSERT/UPDATE workloads (index maintenance cost)',
        ].join('\n'),
        authorId: carol.id,
        teamId: backend.id,
      },
    }),

    // Personal note — only visible to the author
    prisma.note.create({
      data: {
        title: 'Personal Study Plan',
        content: [
          '## Q4 Learning Goals',
          '',
          '- [ ] Complete distributed systems course',
          '- [ ] Read "Designing Data-Intensive Applications" chapters 5-9',
          '- [ ] Build a toy Raft consensus implementation',
          '- [ ] Practice system design interviews',
        ].join('\n'),
        authorId: alice.id,
        // teamId is null → personal note
      },
    }),

    // Team notes — shared with Platform Security
    prisma.note.create({
      data: {
        title: 'Incident Response Runbook',
        content: [
          '## Severity Classification',
          '',
          '| Sev | Impact | Response Time |',
          '|-----|--------|---------------|',
          '| P0  | Service down | 15 min |',
          '| P1  | Major degradation | 1 hour |',
          '| P2  | Minor impact | 4 hours |',
          '',
          '## Steps',
          '1. Acknowledge the alert in PagerDuty',
          '2. Open an incident channel in Slack',
          '3. Identify blast radius and affected customers',
          '4. Communicate status to stakeholders every 30 minutes',
        ].join('\n'),
        authorId: carol.id,
        teamId: platform.id,
      },
    }),

    prisma.note.create({
      data: {
        title: 'Zero-Trust Network Segmentation',
        content: [
          '## Principles',
          '',
          '- Never trust, always verify',
          '- Least privilege access',
          '- Micro-segmentation over perimeter security',
          '- Continuous monitoring and logging',
          '',
          '## Implementation Notes',
          '- Service mesh (Istio) for mTLS between services',
          '- OPA/Gatekeeper policies for Kubernetes admission control',
          '- Network policies to restrict pod-to-pod communication',
        ].join('\n'),
        authorId: dave.id,
        teamId: platform.id,
      },
    }),
  ]);

  console.log(`  ✔ Notes: ${notes.length} (${notes.filter(n => n.teamId).length} team-shared, ${notes.filter(n => !n.teamId).length} personal)`);

  // ── Summary ─────────────────────────────────────────────────────────
  console.log('\n✅ Seed complete!\n');
  console.log('Try these requests:');
  console.log('  GET  http://localhost:3000/users');
  console.log('  GET  http://localhost:3000/teams');
  console.log('  GET  http://localhost:3000/notes');
  console.log(`  GET  http://localhost:3000/notes?authorId=${alice.id}`);
  console.log(`  GET  http://localhost:3000/notes?teamId=${backend.id}`);
  console.log('  GET  http://localhost:3000/docs        ← Swagger UI');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

