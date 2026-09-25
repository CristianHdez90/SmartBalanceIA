declare namespace Cloudflare {
  interface Env {
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    GROQ_API_KEY?: string;
    GROQ_MODEL?: string;
    ADMIN_BOOTSTRAP_TOKEN?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
