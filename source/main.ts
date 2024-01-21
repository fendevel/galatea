import { APIPingInteraction, Application, ApplicationCommandOptionType, ApplicationCommandType, AttachmentBuilder, ChannelType, Client, Collection, CommandInteraction, ContextMenuCommandBuilder, Events, GatewayIntentBits, Guild, GuildMember, Interaction, InteractionResponse, MessageContextMenuCommandInteraction, MessagePayload, REST, Routes, SlashCommandBuilder, SlashCommandMentionableOption, SlashCommandUserOption, Snowflake, User, UserContextMenuCommandInteraction, VoiceBasedChannel, VoiceChannel } from "discord.js"
const { token, clientId, testGuildId } = require("../config.json")
// import {Canvas, loadImage, FontLibrary, DOMMatrix, Path2D} from "skia-canvas"
import {Canvas, loadImage, registerFont, DOMMatrix} from "canvas"
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
            const count = interaction.options.getInteger("count")
            const size = interaction.options.getInteger("size")

            if (count > 10000 || (size != undefined && size < 1)) {
                interaction.reply("Yeah I'm not drawing that.")
                return
            }

            let buffer: Buffer = undefined
            if (text && text == "banana") {
                buffer = await drawBanana(count, size != undefined ? size : 1024)
            } else {
                buffer = await drawTriedStar(text ? text : pickLine(domain), count, size != undefined ? size : 1024)
            }

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
    new SlashCommandBuilder().setName("award").setDescription("⭐")
        .addUserOption(input => input.setName("user").setDescription("The target user"))
        .addStringOption(input => input.setName("text").setDescription("The text to display."))
        .addIntegerOption(input => input.setName("count").setDescription("The number of 'arms' the star should be drawn with."))
        .addIntegerOption(input => input.setName("size").setDescription("The width and height of the image (default is 1024).")),
    new SlashCommandBuilder().setName("refresh").setDescription("Refresh lines cache."),
    new SlashCommandBuilder().setName("help").setDescription("Get a refresher on how to use me."),
]

const voiceCommands = [
    new SlashCommandBuilder().setName("play").setDescription("Play from a source."),
]

const debugCommands = [
    new SlashCommandBuilder().setName("reset").setDescription("Reset command registry."),
]

async function registerCommands() {
    const rest = new REST().setToken(token)

    try {
        let jsonCommands = []
        let debugJsonCommands = []
        let voiceJsonCommands = []
        for (const command of contextCommands) {
            jsonCommands.push(command.toJSON())
        }

        for (const command of debugCommands) {
            debugJsonCommands.push(command.toJSON())
        }

        for (const command of voiceCommands) {
            voiceJsonCommands.push(command.toJSON())
        }

        const data = [
            await rest.put(Routes.applicationCommands(clientId), { body: jsonCommands }),
            await rest.put(Routes.applicationGuildCommands(clientId, testGuildId), { body: debugJsonCommands }),
            await rest.put(Routes.applicationGuildCommands(clientId, testGuildId), { body: voiceJsonCommands }),
        ]

        console.log(`loaded ${data}`)

    } catch(error) {
        console.error(error)
    }
}

function formatLineNew(ctx: CanvasText, w: number, text: string): string {
    let lines = []
    let offset = 0

    for (let i = 1; i < text.length; i += 1) {
        const measuredText = ctx.measureText(text.substring(offset, i))
        if (measuredText.width > w) {
            for (let j = i - 1; j > offset; j -= 1) {
                if (text[j] == " ") {
                    lines.push(text.substring(offset, j))
                    offset = j + 1
                    break
                }
            }
        }
    }

    lines.push(text.substring(offset))

    return lines.join("\n")
}

async function drawTriedStar(chosenLine: string, count: number | undefined = undefined, canvasSize = 1024): Promise<Buffer> {
    const w = canvasSize
    const h = canvasSize

    const canvas = new Canvas(w, h)
    const ctx = canvas.getContext("2d")

    registerFont("data/COMIC.TTF", {
        family: "Comic Sans",
    })

    ctx.quality = "best"
    ctx.patternQuality = "best"

    const starFillColour = "#D7B144"
    const starFillColourBright = "#F4D679"
    const cx = w/2
    const cy = h/2
    const radius = w/2

    let originalInner = radius*0.4, originalOuter = radius*1.0
    let dx = 0, dy = 1

    const armBias = [100, 12, 9, 8, 8, 8, 7, 7, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2]
    const armCount = count != undefined ? count : armBias[Math.round(Math.random()*(armBias.length - 1))]
    const orbitAmount = (Math.PI*2)/(armCount*2)

    const grd = ctx.createLinearGradient(cx + originalInner/16, (cy - originalInner/8) + radius/8, cx - originalInner/8, cy + originalInner + radius/8)
    grd.addColorStop(0.0, starFillColour)
    grd.addColorStop(0.3, starFillColourBright)
    grd.addColorStop(1.0, starFillColour)

    ctx.fillStyle = grd

    if (armCount < 0) {
        if (chosenLine == "absolutely disgusting") {
            const image = await loadImage("data/absolutely_disgusting.jpg")
            ctx.drawImage(image, 0, 0, w, h)
        } else {
            ctx.fillRect(0, 0, w, h)
        }

        ctx.globalCompositeOperation = "destination-out"
    }

    ctx.beginPath()
    
    const bias = [0.1, 0.1, 0.2, 0.5, 1.0, 0.2, 0.3, 0.1, 0.5, 0.2, 0.3, 0.25, 0.1, 0.2, 0.05, 0.0, 0.2, 0.4, 0.1, 0.2, 0.4, 0.1, 0, 0.1, 0.2, 0, 0.1, 0]

    let points = []

    if (armCount == 0) {
        ctx.arc(cx, cy, originalOuter, 0, Math.PI*2)
    } else {
        const count = Math.abs(armCount)
        for (let i = 0; i < count; i += 1) {
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

        ctx.globalCompositeOperation = "source-over"

        ctx.font = '100px "Comic Sans MS"'
        ctx.textAlign = "center"
        ctx.textBaseline = "middle"

        const finalLine = formatLineNew(ctx, w, chosenLine)

        ctx.fillStyle = "#000000"
        ctx.fillText(finalLine, cx, cy)
        ctx.strokeStyle = starFillColour
        ctx.lineWidth = 3
        ctx.strokeText(finalLine, cx, cy)
    }


    return canvas.toBuffer("image/png")
}

async function drawBanana(count: number | undefined = undefined, canvasSize = 1024): Promise<Buffer> {
    const w = canvasSize
    const h = canvasSize

    const canvas = new Canvas(w, h)
    const ctx = canvas.getContext("2d")

    const image_size = 1080

    ctx.quality = "best"
    ctx.patternQuality = "best"

    const cx = w/2
    const cy = h/2
    const radius = w/2
    const bananaRadius = w/4

    const armBias = [100, 12, 9, 8, 8, 8, 7, 7, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2]
    const armCount = count != undefined ? count : armBias[Math.round(Math.random()*(armBias.length - 1))]
    const orbitAmount = (Math.PI*2)/(armCount*2)

    let originalInner = bananaRadius, originalOuter = radius*1.0
    let dx = 0, dy = 1

    // ctx.fill("evenodd")
    // ctx.clip("evenodd")
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.miterLimit = 1.5

    ctx.fillStyle = "#fd0"

    if (armCount < 0) {
        ctx.fillRect(0, 0, w, h)
        ctx.globalCompositeOperation = "destination-out"
    }

    if (true) {
        if (armCount == 0) {
            ctx.arc(cx, cy, originalOuter, 0, Math.PI*2)
        } else {
            let points = []
    
            const bias = [0.1, 0.1, 0.2, 0.5, 1.0, 0.2, 0.3, 0.1, 0.5, 0.2, 0.3, 0.25, 0.1, 0.2, 0.05, 0.0, 0.2, 0.4, 0.1, 0.2, 0.4, 0.1, 0, 0.1, 0.2, 0, 0.1, 0]
            const count = Math.abs(armCount)

            for (let i = 0; i < count; i += 1) {
                const outer = originalOuter
                let inner = Math.max((Math.random()*1.5)*originalInner, bananaRadius*0.9)
                if (inner > originalInner) {
                    inner = Math.max((Math.random()*1.5)*originalInner, bananaRadius*0.9)
                }
        
                const biasOffset = Math.round(Math.random()*100)
                const selectedTipBias = bias[(biasOffset + i) % bias.length]
                
                dx = Math.sin(orbitAmount*(1 + 2*i) + selectedTipBias*Math.random()*Math.PI)
                dy = Math.cos(orbitAmount*(1 + 2*i) + selectedTipBias*Math.random()*Math.PI)
        
                points.push([cx + dx*outer, cy + dy*outer])
            
                dx = Math.sin(orbitAmount*(2 + 2*i))
                dy = Math.cos(orbitAmount*(2 + 2*i))
        
                points.push([cx + dx*inner, cy + dy*inner])
            }
        
            ctx.moveTo(points[points.length - 1][0], points[points.length - 1][1])
        
            for (const point of points) {
                ctx.lineTo(point[0], point[1])
            }
        
            ctx.closePath()
        }
        ctx.fill()
    }

    ctx.globalCompositeOperation = "source-over"

    const adjustTransform = new DOMMatrix([((bananaRadius*2)/image_size), 0, 0, ((bananaRadius*2)/image_size), radius/2, radius/2])

    // ctx.setTransform(adjustTransform)
    // ctx.transform(5.48632,0,0,5.13498,-495.997,-472.601)
    // ctx.ellipse(188.833, 197.197, 98.427, 105.161, 0, 0, Math.PI*2)
    // ctx.fill()

    ctx.fillStyle = "#4da6ff"
    ctx.strokeStyle="#4da6ff"
    ctx.lineWidth = 10

    const eyePosRandom = Math.random()
    const thirdEyePosOffset = eyePosRandom*200 - 50

    const thirdEyeRightControlX0 = 689.493
    const thirdEyeRightControlY0 = 243.569
    const thirdEyeRightControlX1 = 775.81
    const thirdEyeRightControlY1 = 342.428

    const thirdEyeRightControlX2 = 775.81
    const thirdEyeRightControlY2 = 487.671

    const thirdEyeRightX = 775.81 + thirdEyePosOffset
    const thirdEyeRightY = 415.05

    const thirdEyeLeftControlX0 = 644.229
    const thirdEyeLeftControlY0 = 546.631
    const thirdEyeLeftControlX1 = 512.648
    const thirdEyeLeftControlY1 = 487.671

    const thirdEyeLeftControlX2 = 512.648
    const thirdEyeLeftControlY2 = 342.428

    const thirdEyeLeftX = 512.648 - thirdEyePosOffset
    const thirdEyeLeftY = 415.05

    ctx.setTransform(adjustTransform)
    ctx.transform(0.493992,0,0,1.18163,221.756,-196.862)
    ctx.beginPath()
    ctx.moveTo(645.632,243.569)
    ctx.bezierCurveTo(thirdEyeRightControlX0, thirdEyeRightControlY0, thirdEyeRightControlX1,thirdEyeRightControlY1, thirdEyeRightX, thirdEyeRightY)
    ctx.bezierCurveTo(thirdEyeRightControlX2, thirdEyeRightControlY2, 644.229,546.631, 644.229,546.631)
    ctx.bezierCurveTo(thirdEyeLeftControlX0, thirdEyeLeftControlY0, thirdEyeLeftControlX1, thirdEyeLeftControlY1, thirdEyeLeftX, thirdEyeLeftY)
    ctx.bezierCurveTo(thirdEyeLeftControlX2, thirdEyeLeftControlY2, 601.772,243.569, 645.632,243.569)
    ctx.fill()

    const eyePosOffset = eyePosRandom*200 - 100
    const lashPosOffset = Math.random()*200 - 100

    const eyeX = 462.916
    const eyeY = 466.646 - eyePosOffset

    const lashX = 230.837
    const lashY = 420.23 - lashPosOffset

    const ductX = 537.513
    const ductY = 571.082

    const midX = (ductX - eyeX)
    const midY = (ductY - eyeY)
    const len = Math.sqrt(midX*midX + midY*midY)
    const dirX = midX / len
    const dirY = midY / len
    console.log(dirX, dirY)

    const lashControlX0 = 420.919 + dirY*eyePosOffset/2
    const lashControlY0 = 442.809 - dirX*eyePosOffset/2
    const lashControlX1 = 245.756
    const lashControlY1 = 408.626 - (lashPosOffset + eyePosOffset)/2
    const lashControlX2 = 215.917
    const lashControlY2 = 431.834 - (lashPosOffset + eyePosOffset)/2

    const ductControlX0 = 519.279 + dirY*eyePosOffset/2
    const ductControlY0 = 519.693 - dirX*eyePosOffset/2
    const ductControlX1 = 497.756 + dirY*eyePosOffset/2
    const ductControlY1 = 486.421 - dirX*eyePosOffset/2
    const ductControlX2 = 540.023
    const ductControlY2 = 578.156
    const ductControlX3 = 499.635
    const ductControlY3 = 579.951

    const pathEye = () => {
        ctx.beginPath()
        ctx.moveTo(eyeX, eyeY)
        ctx.bezierCurveTo(lashControlX0, lashControlY0, lashControlX1, lashControlY1, lashX, lashY)
        ctx.bezierCurveTo(lashControlX2, lashControlY2, 276.664,605.099, 409.041,597.606)
        ctx.bezierCurveTo(452.97,595.119, 473.181,580.805, 491.926,580.2)
        ctx.bezierCurveTo(ductControlX3,ductControlY3, ductControlX2,ductControlY2, ductX,ductY)
        ctx.bezierCurveTo(ductControlX0, ductControlY0, ductControlX1, ductControlY1, eyeX, eyeY)
    }


    // left eye
    ctx.setTransform(adjustTransform)
    ctx.transform(1,0,0,1,-74.5545,32.1319)
    pathEye()
    ctx.fill()

    // right eye
    ctx.setTransform(adjustTransform)
    ctx.transform(-1,0,0,1,1154.55,32.1319)
    pathEye()
    ctx.fill()

    // mouth half 1
    ctx.setTransform(adjustTransform)

    ctx.transform(1,0,0,1,2.48067,20.9764)
    ctx.transform(1,0,0,1,19.8926,-8.28856)

    ctx.beginPath()
    ctx.moveTo(518.45,931.635)
    ctx.bezierCurveTo(577.672,772.559, 602.993,767.521, 602.993,767.521)
    ctx.lineTo(681.734,870.299)
    ctx.bezierCurveTo(753.961,797.232, 816.176,741.785, 815.18,704.528)

    ctx.stroke()

    // mouth half 2
    ctx.setTransform(adjustTransform)

    ctx.transform(1,0,0,1,2.48067,20.9764)
    ctx.transform(-1,0,0,1,1055.15,-8.28856)
    
    ctx.beginPath()
    ctx.moveTo(518.45,931.635)
    ctx.bezierCurveTo(577.672,772.559, 602.993,767.521, 602.993,767.521)
    ctx.lineTo(681.734,870.299)
    ctx.bezierCurveTo(753.961,797.232, 816.176,741.785, 815.18,704.528)

    ctx.stroke()

    // nose
    ctx.setTransform(adjustTransform)
    ctx.transform(1,0,0,1,-31.6002,36.9996)

    ctx.beginPath()
    ctx.moveTo(571.6,626.086)
    ctx.lineTo(610.453,649.915)
    ctx.lineTo(532.748,649.915)
    ctx.lineTo(571.6,626.086)
    ctx.fill()

    // ctx.drawImage(image, radius/2, radius/2, bananaRadius*2, bananaRadius*2)

    return canvas.toBuffer("image/png")
}

function reloadStarLines() {
    starLines = JSON.parse(fs.readFileSync("lines.json", { encoding: "utf-8" })).starLines
    linesDoneGlobal.clear()
    console.log("Lines cache refreshed")
}

reloadStarLines()

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]})

client.login(token)

client.once(Events.ClientReady, readyClient => {
    console.log(`logged in as ${readyClient.user.tag}!`)
    registerCommands()
})

client.on(Events.InteractionCreate, async interaction => {
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
