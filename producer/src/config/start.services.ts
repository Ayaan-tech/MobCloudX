import kafkaConfig from "./kafka.config.js";

export const init = async()=>{
    try {
        console.log('Initializing Kafka connection...')
        await kafkaConfig.connect();
        console.log('Creating topics...')
        await kafkaConfig.createTopic('telemetry.raw')
        await kafkaConfig.createTopic('transcode.events')
        await kafkaConfig.createTopic('qoe.scores')
        await kafkaConfig.createTopic('adaptation.decisions')
        await kafkaConfig.createTopic('adaptation.feedback')
        await kafkaConfig.createTopic('vmaf.scores')
        console.log('Created topics')
    } catch (error) {
        console.log('Error initializing services', error)
        process.exit(1)
    }
}