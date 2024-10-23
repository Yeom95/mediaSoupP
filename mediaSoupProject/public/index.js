//clientside
const io = require('socket.io-client');
const mediasoupClient = require('mediasoup-client');

const roomName = window.location.pathname.split('/')[2];

const socket = io('/mediasoup', {
    transports: ['websocket'], // 또는 ['polling', 'websocket']
});

socket.on('connection-success',({ socketId,existsProducer }) => {
    console.log(socketId,existsProducer);
    getLocalStream();
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

    joinRoom();
};

const joinRoom = () => {
    socket.emit('joinRoom',{ roomName },(date) => {
        console.log(`Route RTP Capabilities... ${data.rtpCapabilities}`);
        rtpCapabilities = data.rtpCapabilities;

        createDevice();
    });
};

const goConsume = () => {
    goConnect(false);
};

const goConnect = (producerOrConsumer) => {
    isProducer = producerOrConsumer;
    device === undefined ? getRtpCapabilities() : goCreateTransport();
};

const goCreateTransport = () => {
    isProducer ? createSendTransport() : createRecvTransport();
};

const getLocalStream = () => {
    navigator.mediaDevices.getUserMedia({
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
    }).then(streamSuccess).catch((error) => {
        console.log(error.message);
    });
};

let device;
let rtpCapabilities;
let producerTransport;
let consumerTransport = [];
let producer;
let consumer;
let isProducer = false;

const createDevice = async() => {
    try{
        device = new mediasoupClient.Device();

        await device.load({
            routerRtpCapabilities:rtpCapabilities,
        });

        console.log('RTP Capabilities',rtpCapabilities);

        createSendTransport();
    } catch (error) {
        console.log(error);
        if(error.name === 'unsupportedError')
        {console.warn('browser not supported');}
    }
};

const getRtpCapabilities = () => {
    socket.emit('createRoom',(data) => {
        console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
        rtpCapabilities = data.rtpCapabilities;
        createDevice();
    });
};

socket.on('new-producer',({ producerId }) => signalNewConsumerTransport(producerId));

const getProducers = () => {
    socket.emit('getProducers',(producerIds) =>{
        producerIds.forEach(signalNewConsumerTransport);
    });
};

const createSendTransport = () => {
    socket.emit('createWebRtcTransport',{ consumer:false },({ params }) => {
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
                }, ({ id,producersExist }) => {
                    callback({ id });

                    if(producersExist)
                    {getProducers();}
                });
            } catch(error){
                errback(error);
            }
        });
        connectSendTransport();
    });
};

const connectSendTransport = async() => {
    producer = await producerTransport.produce(params);

    producer.on('trackended',() => {
        console.log('track ended');

        // close video track
    });

    producer.on('transportclose', () => {
        console.log('transport ended');

        // close video track
    });
};

const signalNewConsumerTransport = async(remoteProducerId) => {
    await socket.emit('createWebRtcTransport',{ consumer:true },({ params }) => {
        if(params.error){
            console.log(params.error);
            return;
        }

        console.log(params);

        consumerTransport = device.createRecvTransport(params);

        consumerTransport.on('connect',async({ dtlsParameters },callback,errback)=>{
            try{
                await socket.emit('transport-recv-connect',{
                    dtlsParameters,
                });
                callback();
            }catch(error){
                errback(error);
            }
        });

        connectRecvTransport(consumerTransport,remoteProducerId,params.id);
    });
};

const connectRecvTransport = async(consumerTransport,remoteProducerId,serverConsumerTransportId) => {
    await socket.emit('consume',{
        rtpCapabilities: device.rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId,
    },async({ params }) => {
        if(params.error){
            console.log('Cannot Consume');
            return;
        }

        console.log(params);

        const consumer = await consumerTransport.consume({
            id:params.id,
            producerId:params.producerId,
            kind:params.kind,
            rtpParameters:params.rtpParameters,
        });

        consumerTransports = [
            ...consumerTransport,
            {
                consumerTransport,
                serverConsumerTransportId:params.id,
                producerId:remoteProducerId,
            },
        ];

        const newElement = document.createElement('div');
        newElement.setAttribute('id',`td-${remoteProducerId}`);
        newElement.setAttribute('class','remoteVideo');
        newElement.innerHTML = '<video id="' + remoteProducerId + '"autoplay class = "video"></video>';
        videoContainer.appendChild(newElement);

        const { track } = consumer;

        //remoteVideo.srcObject = new MediaStream([track]);
        document.getElementById(remoteProducerId).srcObject = new MediaStream([track]);

        //socket.emit('consumer-resume');
        socket.emit('consumer-resume',{ serverConsumerId: params.serverConsumerId });
    });
};

// const btnLocalVideo = document.getElementById('btnLocalVideo');
// const btnRecvSendTransport = document.getElementById('btnRecvSendTransport');

// btnLocalVideo.addEventListener('click',getLocalStream);
// btnRecvSendTransport.addEventListener('click',goConsume);

socket.on('producer-closed', ({ remoteProducerId })=>{
    const producerToClose = consumerTransports.find((transportData) => transportData.producerId === remoteProducerId);
    producerToClose.consumerTransport.close();
    producerToClose.consumer.close();

    consumerTransports = consumerTransports.filter((transportData) => transportData.producerId !== remoteProducerId);

    videoContainer.removeChild(document.getElementById(`td-${remoteProducerId}`));
});