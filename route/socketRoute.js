
import { v4 as UUID } from 'uuid';
import { ws } from './../index.js';

const devices = [];
const clients = [];

const replacer = (key, value) => {
    if (key === 'data' || key === 'heartbeat' || key === 'password') {
        return undefined;
    }
    return value;
}

export const onConnection = (client) => {
    client.on('message', (message) => {
        //console.log(message);

        try {
            const payload = JSON.parse(message);
            if (payload.type === 'reg') {
                if (client.id) return;
                client.isAlive = true;
                const data = {
                    id: UUID(),
                    name: payload.data.name,
                    password: payload.data.password,
                    secured: payload.data.password !== '',
                    busy: false,
                    data: [],
                    size: 0,
                    heartbeat: setInterval(() => {
                        if (!client.isAlive) {
                            return client.terminate();
                        }
                        client.isAlive = false;
                        client.ping(() => { });
                    }, 30000)
                };
                client.id = data.id;
                devices.push(data);
                //client.send(JSON.stringify({ type: 'ack', data: 'registered' }));

                const dev = { type: 'device', data: JSON.parse(JSON.stringify(devices, replacer)) };
                ws.clients.forEach((c) => {
                    const clientIndex = clients.findIndex(o => o.id === c.id);
                    if (clientIndex >= 0) {
                        c.send(JSON.stringify(dev));
                    }
                });
            }

            if (payload.type === 'status') {
                const index = devices.findIndex(o => o.id === client.id);
                if (index >= 0) {
                    devices[index].busy = payload.data;
                    //client.send(JSON.stringify({ type: 'ack', data: 'updated' }));

                    const dev = { type: 'device', data: JSON.parse(JSON.stringify(devices, replacer)) };
                    ws.clients.forEach((c) => {
                        const clientIndex = clients.findIndex(o => o.id === c.id);
                        if (clientIndex >= 0) {
                            c.send(JSON.stringify(dev));
                        }
                    });
                } else {
                    client.terminate();
                }
            }

            if (payload.type === 'start') {
                const index = devices.findIndex(o => o.id === client.id);
                if (index >= 0) {
                    if (devices[index].data.length > 0) devices[index].data.splice(0);
                    devices[index].data.push(...payload.data.data);
                    devices[index].size = payload.data.size;
                    const clientIndex = clients.findIndex(o => o.request === client.id);
                    if (clientIndex >= 0) {
                        ws.clients.forEach((c) => {
                            if (c.id === clients[clientIndex].id) {
                                c.send(JSON.stringify({ type: 'progress', data: Math.round(100 * devices[index].data.length / devices[index].size) }));
                            }
                        });
                    }
                    //client.send(JSON.stringify({ type: 'ack', data: 'start' }));
                } else {
                    client.terminate();
                }
            }

            if (payload.type === 'chunk') {
                const index = devices.findIndex(o => o.id === client.id);
                if (index >= 0) {
                    devices[index].data.push(...payload.data);
                    const clientIndex = clients.findIndex(o => o.request === client.id);
                    if (clientIndex >= 0) {
                        ws.clients.forEach((c) => {
                            if (c.id === clients[clientIndex].id) {
                                c.send(JSON.stringify({ type: 'progress', data: Math.round(100 * devices[index].data.length / devices[index].size) }));
                            }
                        });
                    }
                    //client.send(JSON.stringify({ type: 'ack', data: 'chunk' }));
                } else {
                    client.terminate();
                }
            }

            if (payload.type === 'end') {
                const index = devices.findIndex(o => o.id === client.id);
                if (index >= 0) {
                    devices[index].data.push(...payload.data);
                    const clientIndex = clients.findIndex(o => o.request === client.id);
                    //client.send(JSON.stringify({ type: 'ack', data: 'end' }));
                    if (clientIndex >= 0) {
                        ws.clients.forEach((c) => {
                            if (c.id === clients[clientIndex].id) {
                                c.send(JSON.stringify({ type: 'data', data: devices[index].data }));
                                devices[index].data.splice(0);
                                clients[clientIndex].request = '';
                            }
                        });
                    }
                } else {
                    client.terminate();
                }
            }

            if (payload.type === 'sub') {
                if (client.id) return;
                client.isAlive = true;
                const data = {
                    id: UUID(),
                    request: '',
                    heartbeat: setInterval(() => {
                        if (!client.isAlive) {
                            return client.terminate();
                        }
                        client.isAlive = false;
                        client.ping(() => { });
                    }, 30000)
                };
                client.id = data.id;
                clients.push(data);
                //client.send(JSON.stringify({ type: 'ack', data: 'subscribed' }));
            }

            if (payload.type === 'select') {
                const clientIndex = clients.findIndex(o => o.id === client.id);
                if (clientIndex >= 0) {
                    const index = devices.findIndex(o => o.id === payload.data.id);
                    if (index >= 0) {
                        if (payload.data.password === devices[index].password) {
                            const err = {
                                type: 'granted',
                                data: 'selection completed'
                            };
                            client.send(JSON.stringify(err));
                        } else {
                            const err = {
                                type: 'rejected',
                                data: 'incorrect password'
                            };
                            client.send(JSON.stringify(err));
                        }
                    } else {
                        const err = {
                            type: 'error',
                            data: 'device not found'
                        };
                        client.send(JSON.stringify(err));
                    }
                } else {
                    client.terminate();
                }
            }

            if (payload.type === 'run') {
                const clientIndex = clients.findIndex(o => o.id === client.id);
                if (clientIndex >= 0) {
                    const index = devices.findIndex(o => o.id === payload.data.id);
                    if (index >= 0) {
                        if (devices[index].busy) {
                            const err = {
                                type: 'error',
                                data: 'device is busy'
                            };
                            client.send(JSON.stringify(err));
                        } else {
                            if (devices[index].secured) {
                                if (payload.data.password === devices[index].password) {
                                    ws.clients.forEach((c) => {
                                        if (c.id === payload.data.id) {
                                            c.send(JSON.stringify({ type: 'run' }));
                                            clients[clientIndex].request = payload.data.id;
                                            //client.send(JSON.stringify({ type: 'ack', data: 'run' }));
                                        }
                                    });
                                } else {
                                    const err = {
                                        type: 'error',
                                        data: 'anauthorized access'
                                    };
                                    client.send(JSON.stringify(err));
                                }
                            } else {
                                ws.clients.forEach((c) => {
                                    if (c.id === payload.data.id) {
                                        c.send(JSON.stringify({ type: 'run' }));
                                        clients[clientIndex].request = payload.data.id;
                                        //client.send(JSON.stringify({ type: 'ack', data: 'run' }));
                                    }
                                });
                            }
                        }
                    } else {
                        const err = {
                            type: 'error',
                            data: 'device not found'
                        };
                        client.send(JSON.stringify(err));
                    }
                } else {
                    client.terminate();
                }
            }

            if (payload.type === 'device') {
                const clientIndex = clients.findIndex(o => o.id === client.id);
                if (clientIndex >= 0) {
                    const dev = { type: 'device', data: JSON.parse(JSON.stringify(devices, replacer)) };
                    client.send(JSON.stringify(dev));
                } else {
                    client.terminate();
                }
            }
        } catch (e) {
            console.log(e);
        }

    });

    client.on('pong', () => {
        client.isAlive = true;
    });

    client.on('close', () => {
        const index = devices.findIndex(o => o.id === client.id);
        if (index >= 0) {
            clearInterval(devices[index].heartbeat);
            devices.splice(index, 1);
            ws.clients.forEach((c) => {
                const clientIndex = clients.findIndex(o => o.id === c.id);
                if (clientIndex >= 0) {
                    const dev = { type: 'device', data: JSON.parse(JSON.stringify(devices, replacer)) };
                    c.send(JSON.stringify(dev));
                }
            });
        }

        const clientIndex = clients.findIndex(o => o.id === client.id);
        if (clientIndex >= 0) {
            clearInterval(clients[clientIndex].heartbeat);
            clients.splice(clientIndex, 1);
        }
    });
}