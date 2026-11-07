// Translate managed-preview CLI flags to the delivered server's environment contract.
// The imported module is the actual npm-start entry point; no API injection/mocks.
const portIndex=process.argv.indexOf('--port');
const port=portIndex>=0?process.argv[portIndex+1]:process.env.PORT??'4000';
if(!/^\d+$/.test(port)||Number(port)<1024||Number(port)>65535)throw new Error('Invalid QA preview port');
process.env.PORT=port;
process.env.HOST='127.0.0.1';
process.env.DEMO_MODE='true';
process.env.DATABASE_PATH='/tmp/rescuerelay-actual-web-qa.db';
process.env.REASONING_PROVIDER='offline';
process.env.AI_EXTERNAL_CALLS_ENABLED='false';
process.argv.push('--web');
await import('../../apps/api/src/server.ts');
