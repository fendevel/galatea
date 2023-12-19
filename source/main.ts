import { APIPingInteraction, Application, ApplicationCommandOptionType, ApplicationCommandType, AttachmentBuilder, ChannelType, Client, Collection, CommandInteraction, ContextMenuCommandBuilder, Events, GatewayIntentBits, Guild, Interaction, InteractionResponse, MessageContextMenuCommandInteraction, MessagePayload, REST, Routes, SlashCommandBuilder, SlashCommandMentionableOption, SlashCommandUserOption, Snowflake, User, UserContextMenuCommandInteraction } from "discord.js"
const { token, clientId, testGuildId } = require("../config.json")
import {Canvas, loadImage, registerFont} from "canvas"
import * as path from "node:path"
import * as fs from "node:fs"

let starLines = []
let linesDoneGlobal = new Map<Guild|User, Array<number>>()

console.log("hello world!!!")

type Command = {
    // data: any
    execute: (interaction: CommandInteraction) => void
}

let commands = new Collection<string, Command>()

function pickLine(domain: Guild|User): string {
    if (!linesDoneGlobal.has(domain)) {
        linesDoneGlobal.set(domain, new Array<number>())
        console.log(`added domain ${domain}`)
    }

    if (linesDoneGlobal.get(domain).length >= starLines.length) {
        linesDoneGlobal.set(domain, new Array<number>())
        console.log(`cleared lines for ${domain}`)
    }

    const linesDone = linesDoneGlobal.get(domain)

    const remainingLines = starLines.filter((value, index) => {
        return !linesDone.includes(index)
    })

    const index = Math.round(Math.random()*(remainingLines.length - 1))
    const umappedIndex = starLines.indexOf(remainingLines[index])
    linesDoneGlobal.set(domain, [...linesDone, umappedIndex])

    console.log(`chose line for domain ${domain}: ${umappedIndex}, ${remainingLines[index]}`)

    return remainingLines[index]
}

commands.set("Award author", {
    async execute(interaction: CommandInteraction) {
        if (interaction.isMessageContextMenuCommand()) {
            const domain: Guild|User = interaction.channel ? interaction.guild : interaction.user
            const buffer = await drawTriedStar(pickLine(domain))
            const result = await interaction.reply({
                content: interaction.targetMessage.author.id == client.user.id ? undefined : `${interaction.targetMessage.author}`,
                files: [new AttachmentBuilder(buffer)]
            })
        }
    }
})

commands.set("Award user", {
    async execute(interaction: CommandInteraction) {
        if (interaction.isUserContextMenuCommand()) {
            const domain: Guild|User = interaction.channel ? interaction.guild : interaction.user

            const buffer = await drawTriedStar("phil_what.png")
            const result = await interaction.reply({
                content: interaction.targetUser.id == client.user.id ? undefined : `${interaction.targetUser}`,
                files: [new AttachmentBuilder(buffer)]
            })
        }
    }
})

commands.set("award", {
    async execute(interaction: CommandInteraction) {
        if (interaction.isChatInputCommand()) {
            const domain: Guild|User = interaction.channel ? interaction.guild : interaction.user
            
            const user = interaction.options.getUser("user")
            const text = interaction.options.getString("text")
            const buffer = await drawTriedStar(text ? text : pickLine(domain))
            const result = await interaction.reply({
                content: user ? `${user}` : undefined,
                files: [new AttachmentBuilder(buffer)]
            })
        }
    }
})

commands.set("reset", {
    async execute(interaction: CommandInteraction) {
        if (interaction.isChatInputCommand()) {

            const rest = new REST().setToken(token)

            try {
                await rest.put(Routes.applicationCommands(clientId), { body: [] })
            } catch(error) {
                console.error(error)
            }
        
            interaction.reply({
                content: "It is done.",
            })
        }
    }
})

commands.set("refresh", {
    async execute(interaction: CommandInteraction) {
        reloadStarLines()
        interaction.reply("Refreshed my cache -- but I didn't do it for you or anything.")
    }
})

commands.set("help", {
    async execute(interaction: CommandInteraction) {
        interaction.reply("You can either use the slash command \`/award [user @]\`, or right-click to open the context menu and navigate to Apps -> Award user/author.")
    }
})

const contextCommands = [
    new ContextMenuCommandBuilder().setName("Award author").setType(ApplicationCommandType.Message),
    new ContextMenuCommandBuilder().setName("Award user").setType(ApplicationCommandType.User),
    new SlashCommandBuilder().setName("award").setDescription("⭐").addUserOption(input => input.setName("user").setDescription("The target user")).addStringOption(input => input.setName("text").setDescription("The text to display.")),
    new SlashCommandBuilder().setName("refresh").setDescription("Refresh lines cache."),
    new SlashCommandBuilder().setName("help").setDescription("Get a refresher on how to use me."),
]

const debugCommands = [
    new SlashCommandBuilder().setName("reset"),
]

async function registerCommands() {
    const rest = new REST().setToken(token)

    try {
        let jsonCommands = []
        let debugJsonCommands = []
        for (const command of contextCommands) {
            jsonCommands.push(command.toJSON())
        }

        for (const command of debugCommands) {
            debugJsonCommands.push(command.toJSON())
        }

        const data2: any = await rest.put(Routes.applicationCommands(clientId), { body: jsonCommands })
        const data3: any = await rest.put(Routes.applicationGuildCommands(clientId, testGuildId), { body: debugJsonCommands })
        console.log(`loaded ${data2} ${data3}`)

    } catch(error) {
        console.error(error)
    }
}

async function drawTriedStar(chosenLine: string): Promise<Buffer> {
    const w = 1024
    const h = 1024

    const canvas = new Canvas(w, h, "image")
    const ctx = canvas.getContext("2d")
    registerFont("data/COMIC.TTF", {
        family: "Comic Sans",
    })

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
        const outer = Math.min(Math.random(), 0.25)*originalOuter
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
    if (chosenLine == "absolutely disgusting") {
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
        ctx.lineWidth = 3
        ctx.strokeText(finalLine, cx, cy)
    }


    return canvas.toBuffer()
}

function reloadStarLines() {
    starLines = JSON.parse(fs.readFileSync("lines.json", { encoding: "utf-8" })).starLines
    linesDoneGlobal.clear()
    console.log("Lines cache refreshed")
}

reloadStarLines()

const client = new Client({ intents: [GatewayIntentBits.Guilds]})

client.login(token)

client.once(Events.ClientReady, readyClient => {
    console.log(`logged in as ${readyClient.user.tag}!`)
    registerCommands()
})

client.on(Events.InteractionCreate, async interaction => {
    // console.log(interaction)

    if (!interaction.isMessageContextMenuCommand() && !interaction.isUserContextMenuCommand() && !interaction.isChatInputCommand()) {
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
