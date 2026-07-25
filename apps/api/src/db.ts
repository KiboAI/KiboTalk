import postgres, { type Sql } from 'postgres'

let database: Sql | null = null

export function databaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export function getDatabase(): Sql {
  if (database) return database
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set')
  database = postgres(connectionString, {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  })
  return database
}

export async function closeDatabase(): Promise<void> {
  if (!database) return
  await database.end({ timeout: 5 })
  database = null
}

