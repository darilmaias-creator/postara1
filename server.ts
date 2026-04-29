import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Inicia as variáveis de ambiente (lê o arquivo .env)
dotenv.config();

// Validação de segurança: Impede o servidor de ligar se não tiver a chave configurada
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'AIzaSyAPzHUk-9G-CF87LduV1ocGN5DGRNMcUnA') {
    console.error('⚠️ ALERTA: Você precisa configurar a GEMINI_API_KEY com sua chave real no arquivo .env');
    process.exit(1); // Encerra a aplicação com erro para evitar problemas silenciosos
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

const app = express();

app.use(cors());
app.use(express.json());

// Rota para checar se a API está online
app.get('/api/health', (req: Request, res: Response) => {
    res.status(200).json({ status: 'success', message: 'Postara API 100% Operacional.' });
});

// Nossa Rota de IA real
app.post('/api/ai/generate-description', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { productName, productFeatures } = req.body;

        if (!productName) {
            res.status(400).json({ error: 'O nome do produto é obrigatório.' });
            return;
        }

        const prompt = `
            Atue como um especialista em Marketing Digital.
            Crie uma descrição de post para rede social (Instagram/Facebook) para o seguinte produto:
            Nome do Produto: ${productName}
            Características: ${productFeatures || 'Não informado'}

            A descrição deve ser persuasiva, engajante, ter um tom alegre e terminar com 3 a 5 hashtags relevantes ao produto.
            Use emojis.
        `;

        const result = await model.generateContent(prompt);
        const generatedText = result.response.text();

        res.status(200).json({
            status: 'success',
            data: {
                description: generatedText
            }
        });
    } catch (error) {
        next(error);
    }
});

// Tratamento de erros global
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(`[Erro Crítico]: ${err.message}`);
    res.status(500).json({ error: 'Ocorreu um erro interno no servidor.' });
});

const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
    console.log(`[Postara API] Servidor rodando na porta ${PORT}`);
});