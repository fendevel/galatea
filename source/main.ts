/*

    Authored by Jack P. Fenech
    Github: https://github.com/fendevel
    Twitter: https://twitter.com/fendev

    Galatea is my personal novelty Discord bot. Her source was made public upon request. 
    Her sole function is to randomly generate crude star shapes with messages like "you tried" and "there was an attempt".
*/

import * as discord from "discord.js"
const { token, clientId, testGuildId } = require("../sensitive_config.json")
import {Canvas, loadImage, GlobalFonts, DOMMatrix} from "@napi-rs/canvas"
import * as fs from "node:fs"

const defaultStarSize = 1024
const starPointLimit = 10000
const starSizeLimitLower = 1
const starSizeLimitUpper = 4096

let starLines = []
let linesDoneGlobal = new Map<discord.Guild|discord.User, Array<number>>()

// the idea is to randomly pick a line but not repeat it until all other options have been exhausted
function pickLine(domain: discord.Guild|discord.User): string {
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

function pickCount(): number {
    const armBias = [100, 12, 9, 8, 8, 8, 7, 7, 6, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2]
    return armBias[Math.round(Math.random()*(armBias.length - 1))]
}

type CommandFunc = (interaction: discord.CommandInteraction) => void

const commands = new discord.Collection<string, CommandFunc>([
    ["Award author", async (interaction: discord.CommandInteraction) => {
        if (interaction.isMessageContextMenuCommand()) {
            const domain: discord.Guild|discord.User = interaction.channel ? interaction.guild : interaction.user
            const armCount = pickCount()
            const buffer = await drawStar(pickLine(domain), armCount, defaultStarSize)
            const result = await interaction.reply({
                content: interaction.targetMessage.author.id == interaction.client.user.id ? undefined : `${interaction.targetMessage.author}`,
                files: [new discord.AttachmentBuilder(buffer)]
            })
        }
    }],
    ["Award user", async (interaction: discord.CommandInteraction) => {
        if (interaction.isUserContextMenuCommand()) {
            const domain:  discord.Guild|discord.User = interaction.channel ? interaction.guild : interaction.user
            const armCount = pickCount()
            const buffer = await drawStar(pickLine(domain), armCount, defaultStarSize)
            const result = await interaction.reply({
                content: interaction.targetUser.id == interaction.client.user.id ? undefined : `${interaction.targetUser}`,
                files: [new  discord.AttachmentBuilder(buffer)]
            })
        }
    }],
    ["award", async (interaction: discord.CommandInteraction) => {
        if (interaction.isChatInputCommand()) {
            const domain:  discord.Guild|discord.User = interaction.channel ? interaction.guild : interaction.user
            
            const user = interaction.options.getUser("user")
            const text = interaction.options.getString("text")
            const count = interaction.options.getInteger("count")
            const size = interaction.options.getInteger("size")

            if ((count != undefined && count > starPointLimit) || (size != undefined && (size < starSizeLimitLower || size > starSizeLimitUpper))) {
                let reasons: string[] = []
                if (count != undefined && count > starPointLimit) {
                    reasons.push(`My point limit is ${starPointLimit} but you asked for ${count}.`)
                }

                if (size != undefined) {
                    if (size < starSizeLimitLower || size > starSizeLimitUpper) {
                        reasons.push(`You asked for an image size of ${size}x${size} but my range is [${starSizeLimitLower}, ${starSizeLimitUpper}].`)
                    }
                }

                interaction.reply(`Yeah I'm not drawing that. ${reasons.join(" ")}`)
                return
            }

            const initial = await interaction.reply({
                content: "Drawing...",
            })

            const armCount = count != undefined ? count : pickCount()

            let buffer: Buffer = undefined
            if (text != undefined && (["banana", "venus"].indexOf(text.toLowerCase()) != -1)) {
                buffer = await drawVenus(armCount, size != undefined ? size : defaultStarSize)
            } else {
                buffer = await drawStar(text ? text : pickLine(domain), armCount, size != undefined ? size : defaultStarSize)
            }

            initial.edit({
                content: user ? `${user}` : "",
                files: [new  discord.AttachmentBuilder(buffer)]
            })
        }
    }],
    ["refresh", async (interaction: discord.CommandInteraction) => {
        reloadStarLines()
        interaction.reply("Refreshed my cache -- but I didn't do it for you or anything.")
    }],
    ["help", async (interaction: discord.CommandInteraction) => {
        interaction.reply("You can either use the slash command \`/award [text: value] [count: star points] [size: value] [user: @]\`, or right-click to open the context menu and navigate to Apps -> Award user/author.")
    }],
])

async function registerCommands() {
    const contextCommands = [
        new discord.ContextMenuCommandBuilder().setName("Award author").setType( discord.ApplicationCommandType.Message),
        new discord.ContextMenuCommandBuilder().setName("Award user").setType( discord.ApplicationCommandType.User),
        new discord.SlashCommandBuilder().setName("award").setDescription("⭐")
            .addUserOption(input => input.setName("user").setDescription("The target user"))
            .addStringOption(input => input.setName("text").setDescription("The text to display."))
            .addIntegerOption(input => input.setName("count").setDescription("The number of 'arms' the star should be drawn with."))
            .addIntegerOption(input => input.setName("size").setDescription(`The width and height of the image (default is ${defaultStarSize}).`)),
        new discord.SlashCommandBuilder().setName("refresh").setDescription("Refresh lines cache."),
        new discord.SlashCommandBuilder().setName("help").setDescription("Get a refresher on how to use me."),
    ]
    
    const debugCommands = [
        new discord.SlashCommandBuilder().setName("reset").setDescription("Reset command registry."),
    ]

    const rest = new discord.REST().setToken(token)

    try {
        let jsonCommands = []
        let debugJsonCommands = []
        
        for (const command of contextCommands) {
            jsonCommands.push(command.toJSON())
        }

        for (const command of debugCommands) {
            debugJsonCommands.push(command.toJSON())
        }

        const data = [
            await rest.put(discord.Routes.applicationCommands(clientId), { body: jsonCommands }),
            await rest.put(discord.Routes.applicationGuildCommands(clientId, testGuildId), { body: debugJsonCommands }),
        ]

        console.log(`loaded ${data}`)

    } catch(error) {
        console.error(error)
    }
}

function testText(ctx: CanvasText, size: number, text: string): number {
    const line = text.replaceAll("\n", " ")

    const measuredText = ctx.measureText(line)
    const height = measuredText.actualBoundingBoxAscent + measuredText.actualBoundingBoxDescent
    const dim = Math.sqrt(measuredText.width*height)

    return size/dim
}

function fitText(ctx: CanvasText & CanvasTextDrawingStyles, canvasSize: number, text: string) {
    const sizeRation = canvasSize/1024
    let fontSize = 100*sizeRation

    while (true) {
        ctx.font = `${fontSize}px "Comic Sans MS"`

    }
}

function formatLineNew(ctx: CanvasText, w: number, text: string) {
    let lines = []
    let offset = 0

    let heights = []

    for (let i = 1; i < text.length; i += 1) {
        const measuredText = ctx.measureText(text.substring(offset, i))
        if (measuredText.width > w) {
            for (let j = i - 1; j > offset; j -= 1) {
                if ([" ", ","].includes(text[j])) {
                    heights.push(measuredText.actualBoundingBoxAscent + measuredText.actualBoundingBoxDescent)
                    lines.push(text.substring(offset, j))
                    offset = j + 1
                    break
                }
            }
        }
    }

    lines.push(text.substring(offset))
    const measuredText = ctx.measureText(text.substring(offset))
    heights.push(measuredText.actualBoundingBoxAscent + measuredText.actualBoundingBoxDescent)

    return [lines, heights]
}

async function drawStar(chosenLine: string, count: number, canvasSize: number): Promise<Buffer> {
    const w = canvasSize
    const h = canvasSize

    const sizeRation = canvasSize/1024

    const canvas = new Canvas(w, h)
    const ctx = canvas.getContext("2d")

    ctx.imageSmoothingQuality = "high"

    const starFillColour = "#D7B144"
    const starFillColourBright = "#F4D679"
    const cx = w/2
    const cy = h/2
    const radius = w/2

    let originalInner = radius*0.4, originalOuter = radius*1.0
    let dx = 0, dy = 1

    const armCount = count
    const orbitAmount = (Math.PI*2)/(armCount*2)

    const grd = ctx.createLinearGradient(cx + originalInner/16, (cy - originalInner/8) + radius/8, cx - originalInner/8, cy + originalInner + radius/8)
    grd.addColorStop(0.0, starFillColour)
    grd.addColorStop(0.3, starFillColourBright)
    grd.addColorStop(1.0, starFillColour)

    ctx.fillStyle = grd

    const absolutelyDisgusting = "absolutely disgusting"

    if (armCount < 0 || Object.is(armCount, -0)) {
        if (chosenLine.toLowerCase() == absolutelyDisgusting) {
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
    if (chosenLine == absolutelyDisgusting) {
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

        ctx.font = `${100*sizeRation}px "Comic Sans MS"`
        const multiplier = testText(ctx, 1024, chosenLine)
        if (multiplier < 0.9) {
            ctx.font = `${Math.round(100*sizeRation*multiplier)}px "Comic Sans MS"`
        }

        ctx.textAlign = "center"
        ctx.textBaseline = "hanging"

        const [finalLines, heights] = formatLineNew(ctx, w, chosenLine)

        ctx.fillStyle = "#000000"
        ctx.strokeStyle = starFillColour
        ctx.lineWidth = 3*sizeRation
        
        let yOffset = -(heights as number[]).reduce((a, b) => a+b)/2
        for (let i = 0; i < finalLines.length; i += 1) {
            const lineHeight: number = heights[i]
            const line = finalLines[i] as string

            ctx.fillText(line, cx, cy + yOffset)
            ctx.strokeText(line, cx, cy + yOffset)
            yOffset += lineHeight
        }
    }


    return canvas.toBuffer("image/png")
}

// in-joke alternative drawing routine that displays a star in the likeness of my friend's (https://twitter.com/Venny2003) character
async function drawVenus(count: number, canvasSize): Promise<Buffer> {
    const venusYellow = "#fd0"
    const venusBlue = "#4da6ff"

    const w = canvasSize
    const h = canvasSize

    const canvas = new Canvas(w, h)
    const ctx = canvas.getContext("2d")

    // my original reference vector graphic had a WxH of 1080 but we need it to scale with arbitrary canvas sizes
    const refScale = 1080

    ctx.imageSmoothingQuality = "high"

    const cx = w/2
    const cy = h/2
    const radius = w/2
    const venusRadius = w/4

    const armCount = count
    const orbitAmount = (Math.PI*2)/(armCount*2)

    let originalInner = venusRadius, originalOuter = radius*1.0
    let dx = 0, dy = 1

    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    ctx.miterLimit = 1.5

    ctx.fillStyle = venusYellow

    if (armCount < 0 || Object.is(armCount, -0)) {
        ctx.fillRect(0, 0, w, h)
        ctx.globalCompositeOperation = "destination-out"
    }

    if (armCount == 0) {
        ctx.arc(cx, cy, originalOuter, 0, Math.PI*2)
    } else {
        let points = []

        const bias = [0.1, 0.1, 0.2, 0.5, 1.0, 0.2, 0.3, 0.1, 0.5, 0.2, 0.3, 0.25, 0.1, 0.2, 0.05, 0.0, 0.2, 0.4, 0.1, 0.2, 0.4, 0.1, 0, 0.1, 0.2, 0, 0.1, 0]
        const count = Math.abs(armCount)

        for (let i = 0; i < count; i += 1) {
            const outer = originalOuter
            let inner = Math.max((Math.random()*1.5)*originalInner, venusRadius*0.9)
            if (inner > originalInner) {
                inner = Math.max((Math.random()*1.5)*originalInner, venusRadius*0.9)
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

    ctx.globalCompositeOperation = "source-over"

    const adjustTransform = new DOMMatrix([((venusRadius*2)/refScale), 0, 0, ((venusRadius*2)/refScale), radius/2, radius/2])

    ctx.fillStyle = venusBlue
    ctx.strokeStyle = venusBlue
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

    return canvas.toBuffer("image/png")
}

function reloadStarLines() {
    starLines = JSON.parse(fs.readFileSync("lines.json", { encoding: "utf-8" })).starLines
    linesDoneGlobal.clear()
    console.log("Lines cache refreshed")
}

function entry() {
    if (GlobalFonts.registerFromPath("data/COMIC.TTF", "Comic Sans")) {
        console.log("successfully registered font")
    } else {
        console.error("failed to register font!")
        return
    }

    reloadStarLines()

    const client = new discord.Client({ intents: [discord.GatewayIntentBits.Guilds, discord.GatewayIntentBits.GuildVoiceStates]})

    client.login(token)

    client.once(discord.Events.ClientReady, readyClient => {
        console.log(`logged in as ${readyClient.user.tag}!`)
        registerCommands()
    })

    client.on(discord.Events.InteractionCreate, async interaction => {
        if (!interaction.isMessageContextMenuCommand() && !interaction.isUserContextMenuCommand() && !interaction.isChatInputCommand()) {
            return
        }

        const command = commands.get(interaction.commandName)

        if (!command) {
            console.error(`failed to find command ${interaction.commandName}`)
            return
        }

        try {
            await command(interaction)
        } catch(error) {
            console.error(error)
        }
    })
}

entry()
