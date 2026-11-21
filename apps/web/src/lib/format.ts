export const label = (value: string) => value.replaceAll('_', ' ');

export const dateLabel = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'Not set';
