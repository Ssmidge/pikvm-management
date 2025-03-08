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
    - list the managed PiKVMs - Data stored in a Cloudflare D1 store - DONE
    - Show the power status of each machine (if it's setup) - DONE
    - Get the basic system information - DONE
    - Allow mass actions of all of the mentioned above - DONE
    - Preferably, add a form of IP-based authentication, or ownership
    - Move everything to modules so we don't have a 200 line index.ts
    - Be able to upload the image to the PiKVM
*/
app.get('/', async (c) => {
    return c.json({ success: true, results: { message: 'Hello, World!', documentation: 'https://github.com/Ssmidge/pikvm-management/blob/main/README.md' } });
});

app.get('/info', async (c) => {
    return c.json({ success: true, results: { version: '1.0.0', author: 'Ssmidge', copyright: "This software is provided as-is with no guarantee :D" } });
});

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

    return c.json({ success: info.ok });
});

// Mass Storage Device stuff
// this is going to be annoying as fuck but whatever anything is better than having to auth every single time
app.get('/storage/:name', async (c) => {
    const name = c.req.param('name');
    if (!name) return c.json({ success: false, error: 'Missing required fields' });

    const kvm = (await c.env.database.prepare('SELECT * FROM kvms WHERE name = ?').bind(name).run()).results[0] as unknown as KVMConfig;
    if (!kvm) return c.json({ success: false, error: 'KVM not found' });

    const { baseUrl, username, password } = kvm;

    const info = await (await fetch(`https://${baseUrl}/api/msd`, { headers: { 'X-KVMD-User': username, 'X-KVMD-Passwd': password }, method: 'GET' })).json() as any;

    return c.json({
        success: info.ok,
        drive: {
            type: info.result.drive.cdrom ? "cdrom" : "flash",
            connected: info.result.drive.connected,
            image: info.result.drive.image,
            isReadWrite: info.result.drive.rw,
        },
    })
});

app.post('/storage/:name/setting', async (c) => {
    const name = c.req.param('name');
    if (!name) return c.json({ success: false, error: 'Missing required fields' });

    const kvm = (await c.env.database.prepare('SELECT * FROM kvms WHERE name = ?').bind(name).run()).results[0] as unknown as KVMConfig;
    if (!kvm) return c.json({ success: false, error: 'KVM not found' });

    const { baseUrl, username, password } = kvm;

    let { cdrom, rw } = await c.req.json() as { cdrom: boolean, rw: boolean };
    if (cdrom === undefined && rw === undefined) return c.json({ success: false, error: 'Missing required fields' });

    // if the drive is already a cdrom, then it's already read-only on the PiKVM side
    if (cdrom) rw = false;

    const info = await (await fetch(`https://${baseUrl}/api/msd`, { headers: { 'X-KVMD-User': username, 'X-KVMD-Passwd': password, 'Content-Type': 'application/json' }, method: 'POST', body: JSON.stringify({ cdrom, rw }) })).json() as any;

    return c.json({ success: info.ok });
});

app.post('/storage/:name/connect', async (c) => {
    const name = c.req.param('name');
    if (!name) return c.json({ success: false, error: 'Missing required fields' });

    const kvm = (await c.env.database.prepare('SELECT * FROM kvms WHERE name = ?').bind(name).run()).results[0] as unknown as KVMConfig;
    if (!kvm) return c.json({ success: false, error: 'KVM not found' });

    const { baseUrl, username, password } = kvm;

    const info = await (await fetch(`https://${baseUrl}/api/msd/set_connected?connected=1`, { headers: { 'X-KVMD-User': username, 'X-KVMD-Passwd': password, 'Content-Type': 'application/json' }, method: 'POST', body: undefined })).json() as any;

    return c.json({ success: info.ok });
});

app.post('/storage/:name/disconnect', async (c) => {
    const name = c.req.param('name');
    if (!name) return c.json({ success: false, error: 'Missing required fields' });

    const kvm = (await c.env.database.prepare('SELECT * FROM kvms WHERE name = ?').bind(name).run()).results[0] as unknown as KVMConfig;
    if (!kvm) return c.json({ success: false, error: 'KVM not found' });

    const { baseUrl, username, password } = kvm;

    const info = await (await fetch(`https://${baseUrl}/api/msd/set_connected?connected=0`, { headers: { 'X-KVMD-User': username, 'X-KVMD-Passwd': password, 'Content-Type': 'application/json' }, method: 'POST', body: undefined })).json() as any;

    return c.json({ success: info.ok });
});

// Bulk actions for power
app.post('/power', async (c) => {
    const { names, action } = await c.req.json() as { names: string[], action: 'short_press' | 'long_press' | 'reset' };
    if (!names || !action || !['short_press', 'long_press', 'reset'].includes(action)) { return c.json({ success: false, error: 'Missing required fields' }); }
    const mappedAction = { short_press: 'power', long_press: 'power_long', reset: 'reset' };
    const results = [];
    for (const name of names) {
        const kvm = (await c.env.database.prepare('SELECT * FROM kvms WHERE name = ?').bind(name).run()).results[0] as unknown as KVMConfig;
        if (!kvm) return c.json({ success: false, error: 'KVM not found' });
    
        const { baseUrl, username, password } = kvm;
        
        const info = await (await fetch(`https://${baseUrl}/api/atx/click?button=${mappedAction[action]}`, { headers: { 'X-KVMD-User': username, 'X-KVMD-Passwd': password }, method: 'POST', body: undefined })).json() as any;
        results.push({ name, success: info.ok });
    }
    return c.json({ success: true, results });
});
export default app;