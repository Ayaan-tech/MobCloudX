import kafkaConfig from "./kafka.config.js";

export const init = async()=>{
    try {
        console.log('Initializing Kafka connection...')
        await kafkaConfig.connect();
        console.log('Creating topics...')
        await kafkaConfig.createTopic('telemetry.raw')
        await kafkaConfig.createTopic('transcode.events')
        await kafkaConfig.createTopic('qoe.scores')
        console.log('Created topics')
    } catch (error) {
        console.log('Error initializing services', error)
        process.exit(1)
    }
}