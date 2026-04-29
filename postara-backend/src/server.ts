import { app } from './app';
import { env } from './config/env';

app.listen(env.port, () => {
    console.log(`[Postara API] Servidor rodando na porta ${env.port}`);
});
