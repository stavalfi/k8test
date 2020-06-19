declare module 'object-deep-contain' {
  export default function(bigObject: unknown, smallerObject: unknown): boolean
}

declare module 'object-delete-key' {
  export default function(
    originalInput: unknown,
    originalOpts: {
      key?: string
      value?: string
      cleanup?: boolean
      only?: 'any' | 'object-type' | 'array-type'
    },
  ): object
}
