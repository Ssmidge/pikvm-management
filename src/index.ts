import { Hono } from 'hono';
type KVMConfig = {
    name: string; // usually the location, like i have mine named for which Rack unit it is in, since I have a few servers that I'd like to manage with PiKVM
    baseUrl: string; // the IP of the pikvm
    username: string; // the username for the pikvm
    password: string; // the API key for the pikvm
};
type Bindings = { database: D1Database; };

const app = new Hono<{Bindings: Bindings }>();

/*
  Development plan:
    - list the managed PiKVMs - Data stored in a Cloudflare D1 store
    - Show the power status of each machine (if it's setup)
    - Get the basic system information
    - Allow mass actions of all of the mentioned above
*/
app.get('/list', async (c) => {
    const sqlQuery = await c.env.database.prepare('SELECT * FROM kvms').all();
    const list: KVMConfig[] = sqlQuery.results as KVMConfig[];
    // censor the API key, basically i do the thing whatever im stealing this code from some python script i made for minecraft login
    list.forEach((kvm) => kvm.password = kvm.password.replace(/./g, '*'));
    return c.json(list);
});

app.post('/add', async (c) => {
    const { name, baseUrl, username, password } = await c.req.json() as unknown as KVMConfig;
    if (!name || !baseUrl || !username || !password) return c.json({ success: false, error: 'Missing required fields' });
    try {
        const sqlQuery = await c.env.database.prepare('INSERT INTO kvms (name, baseUrl, username, password) VALUES (?, ?, ?, ?)').bind(name, baseUrl, username, password).run();
        return c.json({ success: sqlQuery.success, results: sqlQuery.results });
        } catch (e) {
            const error = e as Error;
        return c.json({ success: false, error: error.message });
    }
});

app.delete('/remove', async (c) => {
    const { name } = await c.req.json() as unknown as { name: string };
    if (!name) return c.json({ success: false, error: 'Missing required fields' });
    try {
        const sqlQuery = await c.env.database.prepare('DELETE FROM kvms WHERE name = ?').bind(name).run();
        return c.json({ success: sqlQuery.success, results: sqlQuery.results });
    } catch (e) {
        const error = e as Error;
        return c.json({ success: false, error: error.message });
    }
});

app.get('/system/:name', async (c) => {
    // ApiKey and BaseUrl are needed, it's BASEURL/api/info
    const name = c.req.param('name');
    if (!name) return c.json({ success: false, error: 'Missing required fields' });
    
    const kvm = (await c.env.database.prepare('SELECT * FROM kvms WHERE name = ?').bind(name).run()).results[0] as unknown as KVMConfig;
    if (!kvm) return c.json({ success: false, error: 'KVM not found' });

    const { baseUrl, username, password } = kvm;
    
    const info = await (await fetch(`https://${baseUrl}/api/info`, { headers: { 'X-KVMD-User': username, 'X-KVMD-Passwd': password }, method: 'GET' })).json() as any;

    return c.json({ success: true, results: {
        fan: info.result.fan,
        hardware: {
            cpuUsage: info.result.hw.health.cpu.percent,
            memory: info.result.hw.health.memory,
            temperature: info.result.hw.health.temp.cpu,
            platform: info.result.hw.platform,
        }
    } });
});

app.get('/power/:name', async (c) => {
    const name = c.req.param('name');
    if (!name) return c.json({ success: false, error: 'Missing required fields' });
    
    const kvm = (await c.env.database.prepare('SELECT * FROM kvms WHERE name = ?').bind(name).run()).results[0] as unknown as KVMConfig;
    if (!kvm) return c.json({ success: false, error: 'KVM not found' });

    const { baseUrl, username, password } = kvm;
    
    const info = await (await fetch(`https://${baseUrl}/api/atx`, { headers: { 'X-KVMD-User': username, 'X-KVMD-Passwd': password }, method: 'GET' })).json() as any;
    console.log(info);

    return c.json({ success: true, results: {
        power: info.result,
    } });
});

app.post('/power/:name', async (c) => {
    const name = c.req.param('name');
    if (!name) return c.json({ success: false, error: 'Missing required fields' });

    // Button/Power action executed: short_press, long_press and reset
    const { action } = await c.req.json() as { action: 'short_press' | 'long_press' | 'reset' };
    if (!action || !['short_press', 'long_press', 'reset'].includes(action)) {
        return c.json({ success: false, error: 'Invalid action' });
    }
    
    const mappedAction = { short_press: 'power', long_press: 'power_long', reset: 'reset' };
    
    const kvm = (await c.env.database.prepare('SELECT * FROM kvms WHERE name = ?').bind(name).run()).results[0] as unknown as KVMConfig;
    if (!kvm) return c.json({ success: false, error: 'KVM not found' });

    const { baseUrl, username, password } = kvm;
    
    const info = await (await fetch(`https://${baseUrl}/api/atx/click?button=${mappedAction[action]}`, { headers: { 'X-KVMD-User': username, 'X-KVMD-Passwd': password }, method: 'POST', body: undefined })).json() as any;
    console.log(info);

    return c.json({ success: info.ok });
});

export default app;