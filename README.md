# Clean Node API

API de questionários em TypeScript, Express e MongoDB.

## Executar

Requisitos: Node 22–24, npm e MongoDB. `JWT_SECRET` deve ter pelo menos 32 caracteres; use um valor aleatório e mantenha-o fora do repositório. Trocar o segredo invalida sessões existentes.

```sh
npm ci
export JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
export MONGO_URL='mongodb://127.0.0.1:27017/clean-node-api'
npm run build
npm start
```

`PORT` é opcional (padrão 5050). Para Compose, gere e exporte `JWT_SECRET` como acima e execute:

```sh
npm ci && npm run build
MONGO_URL='mongodb://mongo:27017/clean-node-api' docker compose up
```

O valor explícito evita herdar `MONGO_URL` local ou de `.env`; substitua-o apenas para usar intencionalmente outro MongoDB acessível pelo container. O Compose usa Node 22, não publica o MongoDB no host e preserva `./data`. O MongoDB do Compose não tem autenticação: use-o apenas em ambiente isolado, nunca em produção sem configuração segura.

Na inicialização é criado um índice único em `surveyResponses` por `surveyId` e `accountId`. Se já existirem duplicatas, a aplicação não iniciará: faça backup, identifique e resolva manualmente os registros duplicados antes de reiniciar; nenhum voto é apagado automaticamente.

## Uso

Todas as rotas usam prefixo `/api` e JSON. Faça `POST /signup` com `name`, `email`, `password`, `passwordConfirmation`, ou `POST /login` com `email` e `password`; use `accessToken` da resposta no cabeçalho `x-access-token`. O token expira em uma hora e o login substitui o token anterior.

- `POST /surveys` (somente admin): `{"question":"Cor?","answers":[{"answer":"Azul"},{"answer":"Verde"}]}`. Resposta 204.
- `GET /surveys` (autenticado): lista questionários, incluindo `id`; `page` começa em 1 e `limit` tem padrão 20 e máximo 100.
- `PUT /surveys/:id/result` (autenticado): `{"answer":"Azul"}`. Uma resposta por usuário; outra resposta substitui a anterior, inclusive em concorrência.
- `GET /surveys/:id/result` (autenticado): retorna `surveyId`, `total` e contagem por alternativa.

Questionários legados com alternativas de texto idêntico retornam 409 ao consultar ou registrar resultado, sem alterar votos. Faça backup e corrija manualmente as alternativas e eventuais respostas antes de retomá-los; respostas antigas não distinguem alternativas com o mesmo texto.

Não há endpoint de promoção de administrador. Para desenvolvimento, cadastre uma conta e promova-a diretamente no banco apropriado com `db.accounts.updateOne({email: 'admin@example.com'}, {$set: {role: 'admin'}})` no `mongosh`; faça login novamente. Não exponha acesso administrativo ao banco.

## Verificação

```sh
npm test                 # toda a suíte
npm run test:unit
npm run test:integration
npm run build
```

Os testes usam `mongodb-memory-server`, com banco isolado; na primeira execução é necessário baixar o binário MongoDB 7.0.14. Não apontam para `data/` nem para seu banco de desenvolvimento. Testes de erro existentes podem imprimir logs esperados.

## Limitações

Faltam proteção de força bruta, política de senhas e testes de carga. A aplicação não deve ser exposta em produção sem revisão adicional de segurança, TLS e configuração de CORS. Tokens antigos sem expiração podem ser aceitos enquanto o segredo antigo continuar em uso: faça rotação do segredo ao atualizar.
