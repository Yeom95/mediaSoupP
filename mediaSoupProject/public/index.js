//clientside
const io = require('socket.io-client');
const mediasoupClient = require('mediasoup-client');

const socket = io('/mediasoup');

socket.on('connection-success',(socketId) => {
    console.log(socketId);
});

let params ={
//mediasoup params
    encoding: [
        {
            rid: 'r0',
            maxBitrate:100000,
            scalabilityMode: 'S1T3',
        },
        {
            rid: 'r1',
            maxBitrate:300000,
            scalabilityMode: 'S1T3',
        },
        {
            rid: 'r2',
            maxBitrate:900000,
            scalabilityMode: 'S1T3',
        },
    ],
    codeOptions:{
        videoGoogleStartBitrate:1000,
    },
};

const streamSuccess = async(stream) => {
    localVideo.srcObject = stream;
    const track = stream.getVideoTracks()[0];
    params = {
        track,
        ...params,
    };
};

const getLocalStream = () => {
    navigator.getUserMedia({
        audio: false,
        video: {
            width:{
                min:640,
                max:1920,
            },
            height:{
                min:400,
                max:1080,
            },
        },
    },streamSuccess,(error)=>{
        console.log(error.message);
    });
};

let device;
let rtpCapabilities;
let producerTransport;
let producer;

const createDevice = async() => {
    try{
        device = new mediasoupClient.Device();

        await device.load({
            routerRtpCapabilities:rtpCapabilities,
        });

        console.log('RTP Capabilities',rtpCapabilities);
    } catch (error) {
        console.log(error);
        if(error.name === 'unsupportedError')
        {console.warn('browser not supported');}
    }
};

const getRtpCapabilities = () => {
    socket.emit('getRtpCapabilities',(data) => {
        console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
        rtpCapabilities = data.rtpCapabilities;
    });
};

const createSendTransport = () => {
    socket.emit('createWebRtcTransport',{ sender:true },({ params }) => {
        if(params.error){
            console.log(params.error);
            return;
        }
        console.log(params);

        producerTransport = device.createSendTransport(params);

        producerTransport.on('connect',async({ dtlsParameters },callback,errback) => {
            try{
                await socket.emit('transport-connect',{
                    //transportId:producerTransport.id,
                    dtlsParameters:dtlsParameters,
                });

                callback();
            } catch (error) {
                errback(error);
            }
        });

        producerTransport.on('produce',async(parameters,callback,errback) => {
            console.log(parameters);

            try{
                await socket.emit('transport-produce',{
                    //transportId:producerTransport.id,
                    kind:parameters.kind,
                    rtpParameters:parameters.rtpParameters,
                    appData:parameters.appData,
                }, ({ id }) => {
                    callback({ id });
                });
            } catch(error){
                errback(error);
            }
        });
    });
};

const connectSendTransport = async() => {
    producer = await producerTransport.producer(params);

    producer.on('trackended',() => {
        console.log('track ended');

        // close video track
    });

    producer.on('transportclose', () => {
        console.log('transport ended');

        // close video track
    });
};

const btnLocalVideo = document.getElementById('btnLocalVideo');
const btnRtpCapabilities = document.getElementById('btnRtpCapabilities');
const btnDevice = document.getElementById('btnDevice');
const btnCreateSendTransport = document.getElementById('btnCreateSendTransport');
const btnConnectSendTransport = document.getElementById('btnConnectSendTransport');

btnLocalVideo.addEventListener('click',getLocalStream);
btnRtpCapabilities.addEventListener('click', getRtpCapabilities);
btnDevice.addEventListener('click',createDevice);
btnCreateSendTransport.addEventListener('click',createSendTransport);
btnConnectSendTransport.addEventListener('click',connectSendTransport);