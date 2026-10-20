#!/bin/sh
set -e

# Run database migrations before starting the web server.
# This ensures that whenever the container starts against a new database,
# the schema is guaranteed to be current before traffic is served.
echo "🔄 Applying Prisma database migrations..."
npx prisma migrate deploy

# Execute the primary container command (e.g. node dist/server.js)
exec "$@"

