jest.setTimeout(150 * 1000)

console.log = s => {
  process.stdout.write(s + '\n')
}
