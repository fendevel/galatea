import { APIPingInteraction, Application, ApplicationCommandOptionType, ApplicationCommandType, AttachmentBuilder, Client, Collection, CommandInteraction, ContextMenuCommandBuilder, Events, GatewayIntentBits, Interaction, InteractionResponse, MessageContextMenuCommandInteraction, MessagePayload, REST, Routes, SlashCommandBuilder, SlashCommandMentionableOption, SlashCommandUserOption, UserContextMenuCommandInteraction } from "discord.js"
const { token, clientId, testGuildId } = require("../config.json")
const { starLines } = require("../lines.json")
import {Canvas, loadImage} from "canvas"
import * as path from "node:path"

let linesDone = []

console.log("hello world!!!")

type Command = {
    // data: any
    execute: (interaction: CommandInteraction) => void
}

let commands = new Collection<string, Command>()

function pickLine(): number {
    let index = -1

    if (linesDone.length >= starLines.length) {
        linesDone = []
    }

    do {
        index = Math.round(Math.random()*(starLines.length - 1))
    } while(linesDone.includes(index))

    linesDone.push(index)

    return index
}

commands.set("Award author", {
    async execute(interaction: CommandInteraction) {
        if (interaction.isMessageContextMenuCommand()) {
            const msgInteraction: MessageContextMenuCommandInteraction = interaction

            const buffer = await drawTriedStar(pickLine())
            const result = await interaction.reply({
                content: msgInteraction.targetMessage.author.id == client.user.id ? undefined : `${msgInteraction.targetMessage.author}`,
                files: [new AttachmentBuilder(buffer)]
            })
        }
    }
})

commands.set("Award user", {
    async execute(interaction: CommandInteraction) {
        if (interaction.isUserContextMenuCommand()) {
            const userInteraction: UserContextMenuCommandInteraction = interaction

            const buffer = await drawTriedStar(pickLine())
            const result = await interaction.reply({
                content: userInteraction.targetUser.id == client.user.id ? undefined : `${userInteraction.targetUser}`,
                files: [new AttachmentBuilder(buffer)]
            })
        }
    }
})

const contextCommands = [
    new ContextMenuCommandBuilder().setName("Award author").setType(ApplicationCommandType.Message),
    new ContextMenuCommandBuilder().setName("Award user").setType(ApplicationCommandType.User),
]

async function registerCommands() {
    const rest = new REST().setToken(token)

    try {
        let jsonCommands = []
        for (const command of contextCommands) {
            jsonCommands.push(command.toJSON())
        }

        const data2: any = await rest.put(Routes.applicationCommands(clientId), { body: jsonCommands })
        console.log(`loaded ${data2}`)
    } catch(error) {
        console.error(error)
    }
}

async function drawTriedStar(lineIndex: number): Promise<Buffer> {
    const w = 1024
    const h = 1024

    const canvas = new Canvas(w, h, "image")
    const ctx = canvas.getContext("2d")
    ctx.patternQuality = "best"
    ctx.quality = "best"

    const starFillColour = "#D7B144"
    const starFillColourBright = "#F4D679"
    const cx = w/2
    const cy = h/2
    const radius = w/2

    let originalInner = radius*0.4, originalOuter = radius*1.0
    let sides = 5
    let dx = 0, dy = 1
    const orbitAmount = (Math.PI*2)/10

    const grd = ctx.createLinearGradient(cx + originalInner/16, (cy - originalInner/8) + radius/8, cx - originalInner/8, cy + originalInner + radius/8)
    grd.addColorStop(0.0, starFillColour)
    grd.addColorStop(0.3, starFillColourBright)
    grd.addColorStop(1.0, starFillColour)

    ctx.fillStyle = grd
    ctx.beginPath()
    
    const bias = [0.1, 0.1, 0.2, 0.5, 1.0, 0.2, 0.3, 0.1, 0.5, 0.2, 0.3, 0.25, 0.1, 0.2, 0.05, 0.0, 0.2, 0.4, 0.1, 0.2, 0.4, 0.1, 0, 0.1, 0.2, 0, 0.1, 0]

    let points = []

    for (let i = 0; i < 5; i += 1) {
        const outer = originalOuter
        let inner = Math.max((Math.random()*1.5)*originalInner, radius*0.01)
        if (inner > originalInner) {
            inner = Math.max((Math.random()*1.5)*originalInner, radius*0.01)
        }

        const biasOffset = Math.round(Math.random()*100)
        const selectedTipBias = bias[(biasOffset + i) % bias.length]
    
        dx = Math.sin(orbitAmount*(1 + 2*i) + selectedTipBias*Math.random()*Math.PI)
        dy = Math.cos(orbitAmount*(1 + 2*i) + selectedTipBias*Math.random()*Math.PI)

        points.push([cx + dx*outer, cy + dy*outer])
    
        dx = Math.sin(orbitAmount*(2 + 2*i) + (selectedTipBias*Math.random()*2 - 1)*Math.PI*0.1)
        dy = Math.cos(orbitAmount*(2 + 2*i) + (selectedTipBias*Math.random()*2 - 1)*Math.PI*0.1)
    
        points.push([cx + dx*inner, cy + dy*inner])
    }

    ctx.moveTo(points[points.length - 1][0], points[points.length - 1][1])

    for (const point of points) {
        ctx.lineTo(point[0], point[1])
    }

    ctx.closePath()
    if (starLines[lineIndex] == "absolutely disgusting") {
        ctx.save()
        ctx.clip()
        const image = await loadImage("data/absolutely_disgusting.jpg")
        ctx.drawImage(image, 0, 0, w, h)
        ctx.restore()
        const scale = 3
        ctx.drawImage(image, 129, 365, 208, 32, cx - (208/2)*scale, cy, 208*scale, 32*scale)
        ctx.drawImage(image, 350, 365, 203, 32, cx - (203/2)*scale, cy + 32*scale, 203*scale, 32*scale)

    } else {
        ctx.fill()
        ctx.font = '100px "Comic Sans MS"'
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        const chosenLine: string = starLines[lineIndex]
        let lines = []
        let offset = 0

        const words = chosenLine.split(" ")
        for (let i = 1; i < words.length; i += 1) {
            const segment = words.slice(offset, i).join(" ")
            const msgMetric = ctx.measureText(segment)
            if (msgMetric.width > w*0.8) {
                lines.push(words.slice(offset, i - 1).join(" "))
                offset = i - 1
            }
        }

        lines.push(words.slice(offset).join(" "))

        const finalLine = lines.length == 0 ? chosenLine : lines.join("\n")

        ctx.fillStyle = "#000000"
        ctx.fillText(finalLine, cx, cy)
        ctx.strokeStyle = starFillColour
        ctx.lineWidth = 2
        ctx.strokeText(finalLine, cx, cy)
    }


    return canvas.toBuffer()
}

const client = new Client({ intents: [GatewayIntentBits.Guilds]})

client.login(token)

client.once(Events.ClientReady, readyClient => {
    console.log(`logged in as ${readyClient.user.tag}!`)
    registerCommands()
})

client.on(Events.InteractionCreate, async interaction => {
    console.log(interaction)

    if (!interaction.isMessageContextMenuCommand() && !interaction.isUserContextMenuCommand()) {
        return
    }

    const command = commands.get(interaction.commandName)

    if (!command) {
        console.error(`failed to find command ${interaction.commandName}`)
        return
    }

    try {
        await command.execute(interaction)
    } catch(error) {
        console.error(error)
    }
})
