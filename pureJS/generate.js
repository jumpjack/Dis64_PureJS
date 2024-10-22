// Generate function web version
async function Generate(file, baseAddr, isPrgFile, range, entryPoint) {
    // Function to read file as ArrayBuffer
    const readFileAsArrayBuffer = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(new Uint8Array(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    };

    // Helper functions
    function getNext8bit(src, storeTarget) {
        var lo = bytes[++index];
        src.bytes.push(lo);
        if(storeTarget) src.target = (lo);
        return "$"+lo.toString(16).padStart(2,"0");
    }

    function getNext16bit(src, storeTarget) {
        var lo = bytes[++index];
        var hi = bytes[++index];
        src.bytes.push(lo);
        src.bytes.push(hi);
        if(storeTarget) src.target = (lo+hi*256);
        return "$"+(lo+hi*256).toString(16).padStart(4,"0");
    }

    function getBaseAddress() {
        if(isPrgFile) {
            temp = bytes[0] + bytes[1] * 256;
			baseAddr = "0x" + temp.toString(16);
            index = 2;
        }
    }

    // Main execution
    console.log("Disassembling " + file.name + " in range ",range );

    range = range.split("-").map(a => parseInt(a,16));
console.log("Generate - RANGE=",range);
    let bytes = await readFileAsArrayBuffer(file);
console.log("Generate - bytes=",bytes);
    let index = 0;

    getBaseAddress();
console.log("Dis", bytes,baseAddr,range[0]);
document.getElementById("outputHEX").value = memoryDump(bytes,parseInt(baseAddr, 16) ,  16, range[0])

    let outputSrc = [];
    let baseSet = false;

    let inByteMode = false;
    let byteCounter = 0;
    let byteSource = "";
    let byteBase = -1;
    let byteList = [];

    let lastUpdateIndex = 0;

    console.log("Generate - Range bound to "+range[0]+" -> "+range[1]);

    let disPaths = [];
    let baseOffset = baseAddr;

    if(entryPoint) {
        disPaths.push(entryPoint);
    }

    const updateProgress = (progress) => {
        // Emettere un evento di progresso che pu� essere catturato dall'UI
        const event = new CustomEvent('disassemblyProgress', {
            detail: { progress: Math.round((index/bytes.length) * 100) }
        });
        window.dispatchEvent(event);
    };

    while(index < bytes.length) {
//console.log("Generate - index = ",index);
        // Aggiornamento progresso
        if(index - lastUpdateIndex > 4) {
            updateProgress(index/bytes.length);
            lastUpdateIndex = index;
        }

            //Check if in range
            if(baseAddr >= range[0] && baseAddr < range[1]) {
                if(!baseSet) {
                    outputSrc.push({
                        base: -1,
                        src: "* = $"+baseAddr.toString(16).padStart(4,"0")+" \"Base Address\"\n",
                        label: "",
                        target:null,
                        bytes:[],
                        opcode: null,
                        mode: null,
                        fill: false
                    });
                    baseSet = true;
                }



                let op = bytes[index]

                let res = opcodes[op]

                if(res[0] === null) {
                    if(!inByteMode) {
                        byteCounter = 0;
                        inByteMode = true;
                        byteSource = "        .byte "
                        byteList = []
                        byteBase = baseAddr
                    } else {
                        byteSource += ","
                    }
                    byteSource += `$${op.toString(16).padStart(2,"0")}`
                    byteList.push(op)
                    baseAddr += 1;

                } else {
                    if(inByteMode) {
                        outputSrc.push({
                            base: byteBase,
                            src: byteSource,
                            label: "",
                            target:null,
                            bytes: byteList,
                            opcode: null,
                            mode: null,
                            fill: false
                        })
                    }

                    inByteMode = false;

                    var src = {
                            base: baseAddr,
                            src: "",
                            label: "",
                            bytes: [op],
                            target: null,
                            opcode: res[0],
                            mode: res[1],
                            fill: false
                    };

                    let vals = ""
                    switch(res[1]) {
                        case "":
                            baseAddr += 1;
                            break

                        case "imm":
                            vals += "#"+ getNext8bit(src)
                            baseAddr += 2;
                            break

                        case "zp":
                            vals += getNext8bit(src, true)
                            baseAddr += 2;
                            break

                        case "zpx":
                            vals += getNext8bit(src, true)+",x"
                            baseAddr += 2;
                            break

                        case "zpy":
                            vals += getNext8bit(src, true)+",y"
                            baseAddr += 2;
                            break

                        case "izx":
                            vals += "(" + getNext8bit(src, true)+",x)"
                            baseAddr += 2;
                            break

                        case "izy":
                            vals += "("+getNext8bit(src, true)+"),y"
                            baseAddr += 2;
                            break

                        case "abs":
                            vals += getNext16bit(src, true)
                            baseAddr += 3;
                            break

                        case "abx":
                            vals += getNext16bit(src, true)+",x"
                            baseAddr += 3;
                            break

                        case "aby":
                            vals += getNext16bit(src, true)+",y"
                            baseAddr += 3;
                            break

                        case "ind":
                            vals += "("+getNext16bit(src, true)+")"
                            baseAddr += 3;
                            break

                        case "rel":
                            var lo = bytes[++index]
                            src.bytes.push(lo)
                            if(lo >= 128) lo = (256 - lo) * -1
                            src.target = (baseAddr + lo + 2)
                            vals += `$${(baseAddr + lo + 2).toString(16).padStart(4,"0")}`
                            baseAddr += 2;
                            break

                        default:
                            console.log("PARSE ERROR @ $"+baseAddr.toString(16).padStart(4,"0"))
                            baseAddr += 1;
                            break;
                    }

                    //remove jsr $2020
                    if( (src.opcode === "jsr" && src.target === 0x2020) ||
                        (src.mode === "ind" && src.target === 0x6c6c)){

                        src.target = null
                        src.opcode = null
                        src = Utils.FormatByteLine(src)

                    } else {
                        src.src= `        ${res[0]} ${vals}`
                    }

                    if(outputSrc.length === 1) {
                        src.label = `L_${src.base.toString(16).padStart(4,"0")}`
                    }
                    outputSrc.push(src)
                }
        } else {
            baseAddr++;
        }
        index++;
    }

    updateProgress(1); // 100%
    return outputSrc;
}

// Esporta le funzioni per l'uso nel browser
window.Dis64 = {
    Generate,
    Utils,
    opcodes
};
