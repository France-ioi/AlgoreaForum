# Use cases

## Connection of an assistant

`registerAvailableAssistant()`

- The server marks the assistant as "**available**"
- The server sends the assistant a list of trainees waiting for an answer

## Connection of a trainee - a trainee requests help

`registerWaitingTrainee()`

- The server adds a "**waiting**" trainee
- The server sends to "**free**" assistants the new help request

## A free assistant proposes help to a trainee by answering with a message

`assistantOffersHelp()`

- The server forwards the help message to the trainee

## A waiting trainee accepts help offer of an assistant

`traineeAcceptsHelpOffer()`

- The server updates the assistant and trainee status to "**busy**" and broadcasts the trainee new status to assistants.

## A waiting trainee rejects help offer of an assistant

`traineeRejectsHelpOffer()`

- The server forwards the help message to the assistant

<!-- ## A busy assistant/trainee answers/sends-a-new-message

`helpMessage()`

- The server forwards that message to the interlocutor -->


## End the help process from an assistant or a trainee

`endHelpProcess()`

- The server updates the assistant-or-trainee's status to "**available**"
- The server sends the assistant all the pending help requests

## Disconnection of trainee

`handleTraineeDisconnection()`

- The server removes the trainee from the peers entries
- The server broadcasts message `'peer-disconnected'` to busy assistants


## Disconnection of an assistant

`handleAssistantDisconnection()`

- The server removes the assistant from the peer entries
- The server broadcasts `'peer-disconnected'` to busy trainees

