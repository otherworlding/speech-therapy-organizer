import JSZip from 'jszip'

const NS = {
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
}

const pct = (emu, total) => (parseInt(emu) / parseInt(total)) * 100

function byTag(doc, ns, local) {
  return Array.from(doc.getElementsByTagNameNS(ns, local))
}

function attr(el, ns, local) {
  return el ? (el.getAttributeNS(ns, local) || el.getAttribute(local) || '') : ''
}

async function getMediaMap(zip, relsPath) {
  const map = {}
  const relsFile = zip.file(relsPath)
  if (!relsFile) return map
  const xml = await relsFile.async('text')
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  for (const rel of byTag(doc, NS.rel, 'Relationship')) {
    const id = rel.getAttribute('Id')
    const target = rel.getAttribute('Target') || ''
    const mediaPath = target.startsWith('../')
      ? 'ppt/' + target.slice(3)
      : 'ppt/slides/' + target
    const file = zip.file(mediaPath)
    if (!file) continue
    const ext = mediaPath.split('.').pop().toLowerCase()
    const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', svg: 'image/svg+xml', bmp: 'image/bmp', wmf: 'image/wmf' }[ext] || 'image/png'
    const b64 = await file.async('base64')
    map[id] = `data:${mime};base64,${b64}`
  }
  return map
}

export async function parsePptx(arrayBuffer) {
  const zip = await JSZip.loadAsync(arrayBuffer)

  // Slide size
  let slideW = 9144000, slideH = 5143500
  const presFile = zip.file('ppt/presentation.xml')
  if (presFile) {
    const presXml = await presFile.async('text')
    const presDoc = new DOMParser().parseFromString(presXml, 'application/xml')
    const sldSz = presDoc.getElementsByTagName('p:sldSz')[0] || presDoc.getElementsByTagName('sldSz')[0]
    if (sldSz) {
      slideW = parseInt(sldSz.getAttribute('cx') || slideW)
      slideH = parseInt(sldSz.getAttribute('cy') || slideH)
    }
  }

  // Slide file list in order
  const slideFiles = Object.keys(zip.files)
    .filter(f => /^ppt\/slides\/slide\d+\.xml$/.test(f))
    .sort((a, b) => {
      const n = s => parseInt(s.match(/slide(\d+)/)[1])
      return n(a) - n(b)
    })

  const slides = []

  for (const slidePath of slideFiles) {
    const slideXml = await zip.file(slidePath).async('text')
    const doc = new DOMParser().parseFromString(slideXml, 'application/xml')

    const slideNum = slidePath.match(/slide(\d+)/)[1]
    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`
    const mediaMap = await getMediaMap(zip, relsPath)

    // Background
    let background = { type: 'solid', color: '#FFFFFF' }
    const bgFills = [...doc.getElementsByTagName('p:bg'), ...doc.getElementsByTagName('bg')]
    if (bgFills.length) {
      const solidClrs = bgFills[0].getElementsByTagName('a:srgbClr')
      if (solidClrs.length) background = { type: 'solid', color: '#' + solidClrs[0].getAttribute('val') }
      const blips = bgFills[0].getElementsByTagName('a:blip')
      if (blips.length) {
        const rId = attr(blips[0], NS.r, 'embed')
        if (rId && mediaMap[rId]) background = { type: 'image', data: mediaMap[rId] }
      }
    }

    const elements = []

    // Images (p:pic)
    const pics = [...doc.getElementsByTagName('p:pic'), ...doc.getElementsByTagName('pic')]
    for (const pic of pics) {
      const blips = pic.getElementsByTagName('a:blip')
      if (!blips.length) continue
      const rId = attr(blips[0], NS.r, 'embed')
      if (!rId || !mediaMap[rId]) continue

      const offs = pic.getElementsByTagName('a:off')
      const exts = pic.getElementsByTagName('a:ext')
      if (!offs.length || !exts.length) continue

      elements.push({
        type: 'image',
        x: pct(offs[0].getAttribute('x'), slideW),
        y: pct(offs[0].getAttribute('y'), slideH),
        w: pct(exts[0].getAttribute('cx'), slideW),
        h: pct(exts[0].getAttribute('cy'), slideH),
        src: mediaMap[rId],
      })
    }

    // Text shapes (p:sp)
    const shapes = [...doc.getElementsByTagName('p:sp'), ...doc.getElementsByTagName('sp')]
    for (const sp of shapes) {
      const txBodies = sp.getElementsByTagName('p:txBody')
      if (!txBodies.length) continue
      const txBody = txBodies[0]

      const paras = Array.from(txBody.getElementsByTagName('a:p'))
      const lines = paras.map(p => {
        return Array.from(p.getElementsByTagName('a:t')).map(t => t.textContent).join('')
      }).filter(Boolean)
      if (!lines.length) continue

      const text = lines.join('\n')
      const offs = sp.getElementsByTagName('a:off')
      const exts = sp.getElementsByTagName('a:ext')

      const rPr = txBody.getElementsByTagName('a:rPr')[0]
      const fontSize = rPr ? Math.round(parseInt(rPr.getAttribute('sz') || '1800') / 100) : 18
      const bold = rPr ? rPr.getAttribute('b') === '1' : false
      let color = '#000000'
      if (rPr) {
        const clr = rPr.getElementsByTagName('a:srgbClr')[0]
        if (clr) color = '#' + clr.getAttribute('val')
      }

      elements.push({
        type: 'text',
        x: offs.length ? pct(offs[0].getAttribute('x'), slideW) : 5,
        y: offs.length ? pct(offs[0].getAttribute('y'), slideH) : 5,
        w: exts.length ? pct(exts[0].getAttribute('cx'), slideW) : 90,
        h: exts.length ? pct(exts[0].getAttribute('cy'), slideH) : 20,
        text, fontSize, bold, color,
      })
    }

    slides.push({ background, elements })
  }

  return slides
}
