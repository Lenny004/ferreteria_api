process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://ferreteria_user:throwaway_only@127.0.0.1:55441/ferreteria";
process.env.JWT_SECRET ??= "test-secret-ferreteria-32-caracteres-minimo";
process.env.CORS_ORIGIN ??= "http://localhost:3000";
process.env.COOKIE_SECURE ??= "false";
process.env.COOKIE_SAMESITE ??= "lax";
process.env.EXPOSE_RESET_TOKEN_IN_DEV ??= "false";
