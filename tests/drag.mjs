/**
 * Teste de ponta a ponta do drag & drop, sem framework de teste.
 *
 *   npm run dev            (em outro terminal)
 *   node tests/drag.mjs    (usa o Chrome instalado, sem baixar browser)
 *
 * Variáveis: BASE_URL (default http://localhost:5173), HEADED=1 para ver.
 *
 * Verifica o que o dnd-kit faz de verdade no DOM e o que sobra no
 * localStorage — é o localStorage que prova que a mudança persistiu.
 */
import { chromium } from 'playwright'

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:5173'
const STORAGE_KEY = 'kanban.board.v1'

let failures = 0

function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  PASS  ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

const snapshotOf = (page) =>
  page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.snapshot ?? null,
    STORAGE_KEY,
  )

const columnByTitle = (snapshot, title) =>
  snapshot.columns.find((c) => c.title === title)

const cardByTitle = (snapshot, title) =>
  snapshot.cards.find((c) => c.title.startsWith(title))

const cardsOf = (snapshot, columnId) =>
  snapshot.cards
    .filter((c) => c.columnId === columnId)
    .sort((a, b) => a.position - b.position)

/** dnd-kit precisa de movimento real: um pulo só não passa da ativação. */
async function dragTo(page, source, target, { offsetY = 0 } = {}) {
  const from = await source.boundingBox()
  const to = await target.boundingBox()
  if (!from || !to) throw new Error('elemento sem boundingBox')

  const startX = from.x + from.width / 2
  const startY = from.y + from.height / 2
  const endX = to.x + to.width / 2
  const endY = to.y + to.height / 2 + offsetY

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  // Passa da distância de ativação (6px) antes de caminhar até o destino.
  await page.mouse.move(startX + 12, startY + 4, { steps: 4 })
  await page.mouse.move(endX, endY, { steps: 20 })
  await page.mouse.move(endX, endY, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(450)
}

const run = async () => {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: process.env.HEADED !== '1',
  })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  page.on('pageerror', (err) => {
    failures++
    console.log(`  FAIL  erro de runtime na página — ${err.message}`)
  })

  // Começa de um quadro limpo, com as colunas e cards padrão.
  await page.goto(BASE_URL)
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
  await page.reload()
  await page.locator('section[aria-label^="Coluna "]').first().waitFor()

  const toDo = page.locator('section[aria-label="Coluna A Fazer"]')
  const doing = page.locator('section[aria-label="Coluna Em Andamento"]')

  // ---------------------------------------------------------------
  console.log('\n1) card muda de coluna arrastando')
  {
    const before = await snapshotOf(page)
    const card = cardByTitle(before, 'Clique no card')
    const target = columnByTitle(before, 'Em Andamento')

    await dragTo(page, toDo.locator('li').nth(1), doing)

    const after = await snapshotOf(page)
    const moved = after.cards.find((c) => c.id === card.id)
    check(
      'columnId do card virou "Em Andamento" no localStorage',
      moved.columnId === target.id,
      `columnId=${moved.columnId}`,
    )
    check(
      'card aparece na coluna "Em Andamento" na tela',
      (await doing.locator('li').count()) === 2,
      `cards na coluna = ${await doing.locator('li').count()}`,
    )
    check(
      'card saiu da coluna "A Fazer" na tela',
      (await toDo.locator('li').count()) === 1,
    )
  }

  // ---------------------------------------------------------------
  console.log('\n2) card reordena dentro da mesma coluna')
  {
    const before = await snapshotOf(page)
    const doingId = columnByTitle(before, 'Em Andamento').id
    const orderBefore = cardsOf(before, doingId).map((c) => c.title)

    const items = doing.locator('li')
    await dragTo(page, items.nth(0), items.nth(1), { offsetY: 24 })

    const after = await snapshotOf(page)
    const orderAfter = cardsOf(after, doingId).map((c) => c.title)
    check(
      'ordem dentro da coluna mudou e persistiu',
      orderAfter[0] === orderBefore[1] && orderAfter[1] === orderBefore[0],
      `antes=[${orderBefore}] depois=[${orderAfter}]`,
    )
  }

  // ---------------------------------------------------------------
  console.log('\n3) coluna reordena arrastando o cabeçalho')
  {
    const before = await snapshotOf(page)
    const orderBefore = [...before.columns]
      .sort((a, b) => a.position - b.position)
      .map((c) => c.title)

    await dragTo(
      page,
      page.locator('section[aria-label="Coluna Concluído"] header'),
      toDo.locator('header'),
    )

    const after = await snapshotOf(page)
    const orderAfter = [...after.columns]
      .sort((a, b) => a.position - b.position)
      .map((c) => c.title)
    check(
      'ordem das colunas mudou e persistiu',
      orderAfter[0] === 'Concluído' && orderBefore[0] === 'A Fazer',
      `antes=[${orderBefore}] depois=[${orderAfter}]`,
    )
  }

  // ---------------------------------------------------------------
  console.log('\n4) clicar no card ainda abre o editor (não foi engolido pelo drag)')
  {
    await page.locator('section[aria-label^="Coluna "] li').first().click()
    const dialog = page.getByRole('dialog')
    check('modal "Editar card" abriu', await dialog.isVisible())
    await page.getByRole('button', { name: 'Fechar' }).click()
    await page.waitForTimeout(200)
    check('modal fechou', (await dialog.count()) === 0)
  }

  // ---------------------------------------------------------------
  console.log('\n5) arrastar NÃO abre o editor')
  {
    const items = page.locator('section[aria-label="Coluna Em Andamento"] li')
    await dragTo(page, items.nth(0), toDo)
    check(
      'nenhum modal apareceu depois do arraste',
      (await page.getByRole('dialog').count()) === 0,
    )
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('6) data de conclusão preenche sozinha ao cair em "Concluído"')
  {
    const done = page.locator('section[aria-label="Coluna Concluído"]')
    const before = await snapshotOf(page)
    const doneColumn = columnByTitle(before, 'Concluído')
    // Um card que ainda não passou por lá, e sem data.
    const subject = before.cards.find(
      (c) => c.columnId !== doneColumn.id && c.completedAt === null,
    )
    check('existe card sem data fora da coluna de conclusão', Boolean(subject))

    const sourceColumn = before.columns.find((c) => c.id === subject.columnId)
    const sourceCards = cardsOf(before, subject.columnId)
    const nth = sourceCards.findIndex((c) => c.id === subject.id)
    await dragTo(
      page,
      page.locator(`section[aria-label="Coluna ${sourceColumn.title}"] li`).nth(nth),
      done,
    )

    const after = await snapshotOf(page)
    const moved = after.cards.find((c) => c.id === subject.id)
    const today = new Date()
    const expected = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')
    check('card foi para a coluna de conclusão', moved.columnId === doneColumn.id)
    check(
      'completedAt virou a data de hoje',
      moved.completedAt === expected,
      `completedAt=${moved.completedAt} esperado=${expected}`,
    )
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('7) data já informada é PRESERVADA ao mover para "Concluído"')
  {
    const before = await snapshotOf(page)
    const doneColumn = columnByTitle(before, 'Concluído')
    const subject = before.cards.find((c) => c.columnId !== doneColumn.id)
    check('existe card fora da coluna de conclusão', Boolean(subject))

    // Define a data à mão pelo diálogo — o campo não pode estar bloqueado.
    const sourceColumn = before.columns.find((c) => c.id === subject.columnId)
    const nth = cardsOf(before, subject.columnId).findIndex((c) => c.id === subject.id)
    const cardLocator = page
      .locator(`section[aria-label="Coluna ${sourceColumn.title}"] li`)
      .nth(nth)
    await cardLocator.click()

    const field = page.locator('input[type="date"]').nth(1)
    check('campo "Concluído em" está habilitado', await field.isEnabled())
    await field.fill('2020-01-15')
    await page.getByRole('button', { name: 'Salvar' }).click()
    await page.waitForTimeout(300)

    const saved = (await snapshotOf(page)).cards.find((c) => c.id === subject.id)
    check(
      'data digitada à mão foi salva',
      saved.completedAt === '2020-01-15',
      `completedAt=${saved.completedAt}`,
    )

    await dragTo(
      page,
      page.locator(`section[aria-label="Coluna ${sourceColumn.title}"] li`).nth(nth),
      page.locator('section[aria-label="Coluna Concluído"]'),
    )

    const after = await snapshotOf(page)
    const moved = after.cards.find((c) => c.id === subject.id)
    check('card chegou na coluna de conclusão', moved.columnId === doneColumn.id)
    check(
      'data anterior foi MANTIDA (não sobrescrita por hoje)',
      moved.completedAt === '2020-01-15',
      `completedAt=${moved.completedAt}`,
    )
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('8) sair da coluna de conclusão não apaga a data')
  {
    const before = await snapshotOf(page)
    const doneColumn = columnByTitle(before, 'Concluído')
    const subject = cardsOf(before, doneColumn.id).find(
      (c) => c.completedAt !== null,
    )
    const nth = cardsOf(before, doneColumn.id).findIndex((c) => c.id === subject.id)

    await dragTo(
      page,
      page.locator('section[aria-label="Coluna Concluído"] li').nth(nth),
      page.locator('section[aria-label="Coluna A Fazer"]'),
    )

    const moved = (await snapshotOf(page)).cards.find((c) => c.id === subject.id)
    check('card saiu da coluna de conclusão', moved.columnId !== doneColumn.id)
    check(
      'completedAt continua lá (remoção é só manual)',
      moved.completedAt === subject.completedAt,
      `completedAt=${moved.completedAt}`,
    )
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('9) renomear a coluna de conclusão não quebra o carimbo')
  {
    const done = page.locator('section[aria-label="Coluna Concluído"] h2')
    await done.dblclick()
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.type('Done')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(250)

    const before = await snapshotOf(page)
    const doneColumn = columnByTitle(before, 'Done')
    check('coluna renomeada para "Done"', Boolean(doneColumn))
    check('flag isDone sobreviveu ao rename', doneColumn.isDone === true)

    const subject = before.cards.find(
      (c) => c.columnId !== doneColumn.id && c.completedAt === null,
    )
    const sourceColumn = before.columns.find((c) => c.id === subject.columnId)
    const nth = cardsOf(before, subject.columnId).findIndex((c) => c.id === subject.id)
    await dragTo(
      page,
      page.locator(`section[aria-label="Coluna ${sourceColumn.title}"] li`).nth(nth),
      page.locator('section[aria-label="Coluna Done"]'),
    )

    const moved = (await snapshotOf(page)).cards.find((c) => c.id === subject.id)
    check(
      'carimbo continuou funcionando com o novo nome',
      moved.completedAt !== null,
      `completedAt=${moved.completedAt}`,
    )
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('10) adicionar vários cards de uma vez, separados por ;')
  {
    const before = await snapshotOf(page)
    const toDoColumn = columnByTitle(before, 'A Fazer')
    const antes = cardsOf(before, toDoColumn.id).length

    await page
      .locator('section[aria-label="Coluna A Fazer"] button[aria-label="Opções da coluna"]')
      .click()
    await page.getByRole('menuitem', { name: /Adicionar vários cards/ }).click()

    const dialog = page.getByRole('dialog')
    check('diálogo de criação em lote abriu', await dialog.isVisible())

    // ; como separador, quebra de linha tambem, espacos sobrando e itens
    // vazios no meio (o ";;") precisam ser ignorados.
    await dialog
      .locator('textarea')
      .fill('  Comprar dominio ;; Configurar CI  ;\nEscrever docs ; ')

    check(
      'prévia mostra 3 cards',
      (await dialog.locator('ol li').count()) === 3,
      `itens na prévia = ${await dialog.locator('ol li').count()}`,
    )

    await page.getByRole('button', { name: /Adicionar 3 cards/ }).click()
    await page.waitForTimeout(350)

    const after = await snapshotOf(page)
    const lista = cardsOf(after, toDoColumn.id)
    check('3 cards foram criados', lista.length === antes + 3, `total=${lista.length}`)

    const novos = lista.slice(-3).map((c) => c.title)
    check(
      'títulos limpos e na ordem digitada',
      JSON.stringify(novos) ===
        JSON.stringify(['Comprar dominio', 'Configurar CI', 'Escrever docs']),
      JSON.stringify(novos),
    )
    check(
      'posições crescentes (ordem persistida)',
      lista.slice(-3).every((c, i, arr) => i === 0 || arr[i - 1].position < c.position),
    )
    check('diálogo fechou após adicionar', (await page.getByRole('dialog').count()) === 0)
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('11) filtro de prioridade esconde o que nao bate')
  {
    // Recomeca do quadro padrao: o filtro e estado de sessao, some no reload.
    await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
    await page.reload()
    await page.locator('section[aria-label^="Coluna "]').first().waitFor()

    const chips = page.getByRole('group', { name: 'Filtrar por prioridade' })
    await chips.getByRole('button', { name: 'Baixa' }).click()
    await page.waitForTimeout(250)

    const snapshot = await snapshotOf(page)
    const baixas = snapshot.cards.filter((c) => c.priority === 'low').length
    const visiveis = await page.locator('section[aria-label^="Coluna "] li').count()
    check(
      'so os cards de prioridade Baixa aparecem',
      visiveis === baixas,
      `visiveis=${visiveis} esperados=${baixas}`,
    )
    check(
      'nenhum card foi apagado do localStorage',
      snapshot.cards.length === 4,
      `cards no storage=${snapshot.cards.length}`,
    )
    check(
      'barra avisa quantos ficaram ocultos',
      await page.getByText(`${4 - baixas} cards ocultos`).isVisible(),
    )

    // Segundo chip soma (multi-selecao), nao substitui.
    await chips.getByRole('button', { name: 'Alta' }).click()
    await page.waitForTimeout(250)
    const altasEBaixas = snapshot.cards.filter(
      (c) => c.priority === 'low' || c.priority === 'high',
    ).length
    check(
      'marcar um segundo chip soma as prioridades',
      (await page.locator('section[aria-label^="Coluna "] li').count()) ===
        altasEBaixas,
    )

    await page.getByRole('button', { name: 'limpar filtro' }).click()
    await page.waitForTimeout(250)
    check(
      'limpar filtro devolve todos os cards',
      (await page.locator('section[aria-label^="Coluna "] li').count()) === 4,
    )
  }

  // ---------------------------------------------------------------
  console.log('')
  console.log('12) arrastar FUNCIONA com filtro ativo, respeitando cards ocultos')
  {
    const chips = page.getByRole('group', { name: 'Filtrar por prioridade' })
    await chips.getByRole('button', { name: 'Baixa' }).click()
    await page.waitForTimeout(250)

    const before = await snapshotOf(page)
    const emAndamento = columnByTitle(before, 'Em Andamento')
    const aFazer = columnByTitle(before, 'A Fazer')
    // Em Andamento tem 1 card de prioridade Alta -> OCULTO pelo filtro.
    const oculto = cardsOf(before, emAndamento.id)[0]
    check('coluna destino tem um card oculto pelo filtro', oculto.priority === 'high')
    check(
      'coluna destino aparece vazia na tela',
      (await page.locator('section[aria-label="Coluna Em Andamento"] li').count()) === 0,
    )

    // O unico card visivel de "A Fazer" e o de prioridade Baixa.
    const visivel = cardsOf(before, aFazer.id).find((c) => c.priority === 'low')
    await dragTo(
      page,
      page.locator('section[aria-label="Coluna A Fazer"] li').first(),
      page.locator('section[aria-label="Coluna Em Andamento"]'),
    )

    const after = await snapshotOf(page)
    const movido = after.cards.find((c) => c.id === visivel.id)
    check(
      'card arrastado mudou de coluna mesmo com filtro ativo',
      movido.columnId === emAndamento.id,
      `columnId=${movido.columnId}`,
    )
    check(
      'posicao ficou DEPOIS do card oculto (a conta usou a lista completa)',
      movido.position > oculto.position,
      `movido=${movido.position} oculto=${oculto.position}`,
    )

    const ocultoDepois = after.cards.find((c) => c.id === oculto.id)
    check(
      'card oculto nao foi tocado',
      ocultoDepois.columnId === oculto.columnId &&
        ocultoDepois.position === oculto.position,
    )

    await page.getByRole('button', { name: 'limpar filtro' }).click()
    await page.waitForTimeout(250)
    check(
      'os dois cards aparecem juntos na coluna depois de limpar',
      (await page.locator('section[aria-label="Coluna Em Andamento"] li').count()) === 2,
    )
  }

  await page.screenshot({ path: 'tests/board.png', fullPage: false })
  console.log('\nscreenshot: tests/board.png')

  await browser.close()
  console.log(failures === 0 ? '\nTODOS OS TESTES PASSARAM' : `\n${failures} FALHA(S)`)
  process.exit(failures === 0 ? 0 : 1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
