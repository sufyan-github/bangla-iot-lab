declare module 'virtual:private-lessons' {
  const lessons: Record<string, { title: string; text: string }>;
  export default lessons;
}
