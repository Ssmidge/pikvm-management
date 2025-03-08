# PiKVM Management API
### Current project state: Alpha

## Description
I built this small API to manage a few Raspberry Pis that run the [PiKVM](https://pikvm.org) OS, preferably being able to use it to manage multiple at once, especially for power actions. It's currently in a very early and rough state, however, the code is still mostly readable.

## Running it yourself
You just need a CloudFlare account with an SQL D1 DB created. Here's how your table should look like:
![Image of kvms table](https://hc-cdn.hel1.your-objectstorage.com/s/v3/6916baee67aa1a952a20c13a6850d19b66c952b7_image.png)

## Installation & Usage
```sh
bun install
bun run dev
```

To deploy to Cloudflare Workers:
```sh
bun run deploy
```

## API Endpoints

### List Managed PiKVMs
**GET** `/list`
Retrieves a list of all registered PiKVMs (with API keys censored).

### Add a PiKVM
**POST** `/add`
Adds a new PiKVM to the management system.

**Request Body:**
```json
{
    "name": "Rack Unit 1",
    "baseUrl": "192.168.1.100",
    "username": "admin",
    "password": "securepassword"
}
```

### Remove a PiKVM
**DELETE** `/remove`
Removes a registered PiKVM.

**Request Body:**
```json
{
    "name": "Rack Unit 1"
}
```

### Get System Information
**GET** `/system/:name`
Retrieves basic system information of the specified PiKVM.

**Response Example:**
```json
{
  "success": true,
  "results": {
    "fan": {
      "monitored": false,
      "state": null
    },
    "hardware": {
      "cpuUsage": 3,
      "temperature": 42.932,
      "platform": {
        "base": "Raspberry Pi Zero 2 W Rev 1.0",
        "board": "zero2w",
        "model": "v2",
        "serial": "REDACTED",
        "type": "rpi",
        "video": "hdmi"
      }
    }
  }
}
```

### Get Power Status
**GET** `/power/:name`
Retrieves the current power state of the PiKVM-controlled machine.

**Response Example:**
```json
{
    "success": true,
    "results": {
        "power": "on"
    }
}
```

### Control Power Actions
**POST** `/power/:name`
Sends a power action to the PiKVM.

**Request Body:**
```json
{
    "action": "short_press"
}
```

**Available Actions:**
- `short_press` (Power on/off toggle)
- `long_press` (Force shutdown)
- `reset` (Reboot)

**Response Example:**
```json
{
    "success": true
}
```

