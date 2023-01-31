/*
 * Wire
 * Copyright (C) 2018 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

import {amplify} from 'amplify';
import {container} from 'tsyringe';

import {WebAppEvents} from '@wireapp/webapp-events';

import {PrimaryModal, removeCurrentModal, usePrimaryModalState} from 'Components/Modals/PrimaryModal';
import {t} from 'Util/LocalizerUtil';
import {isBackendError} from 'Util/TypePredicateUtil';

import type {ClientRepository, ClientEntity} from '../client';
import type {ConnectionRepository} from '../connection/ConnectionRepository';
import type {ConversationRepository} from '../conversation/ConversationRepository';
import type {MessageRepository} from '../conversation/MessageRepository';
import {NOTIFICATION_STATE} from '../conversation/NotificationSetting';
import type {Conversation} from '../entity/Conversation';
import type {Message} from '../entity/message/Message';
import type {User} from '../entity/User';
import {BackendClientError} from '../error/BackendClientError';
import type {IntegrationRepository} from '../integration/IntegrationRepository';
import type {ServiceEntity} from '../integration/ServiceEntity';
import {UserState} from '../user/UserState';

export class ActionsViewModel {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly connectionRepository: ConnectionRepository,
    private readonly conversationRepository: ConversationRepository,
    private readonly integrationRepository: IntegrationRepository,
    private readonly messageRepository: MessageRepository,
    private readonly userState = container.resolve(UserState),
  ) {}

  readonly acceptConnectionRequest = (userEntity: User): Promise<void> => {
    return this.connectionRepository.acceptRequest(userEntity);
  };

  readonly archiveConversation = (conversationEntity: Conversation): Promise<void> => {
    if (!conversationEntity) {
      return Promise.reject();
    }

    return this.conversationRepository.archiveConversation(conversationEntity);
  };

  /**
   * @param userEntity User to block
   * @param hideConversation Hide current conversation
   * @param nextConversationEntity Conversation to be switched to
   * @returns Resolves when the user was blocked
   */
  readonly blockUser = (
    userEntity: User,
    hideConversation?: boolean,
    nextConversationEntity?: Conversation,
  ): Promise<void> => {
    // TODO: Does the promise resolve when there is no primary action (i.e. cancel button gets clicked)?
    return new Promise(resolve => {
      PrimaryModal.show(PrimaryModal.type.CONFIRM, {
        primaryAction: {
          action: async () => {
            await this.connectionRepository.blockUser(userEntity, hideConversation, nextConversationEntity);
            resolve();
          },
          text: t('modalUserBlockAction'),
        },

        text: {
          message: t('modalUserBlockMessage', userEntity.name()),
          title: t('modalUserBlockHeadline', userEntity.name()),
        },
      });
    });
  };

  /**
   *
   * @param userEntity User to cancel the sent connection request
   * @param hideConversation Hide current conversation
   * @param nextConversationEntity Conversation to be switched to
   * @returns Resolves when the connection request was canceled
   */
  readonly cancelConnectionRequest = (
    userEntity: User,
    hideConversation?: boolean,
    nextConversationEntity?: Conversation,
  ): Promise<void> => {
    if (!userEntity) {
      return Promise.reject();
    }

    return new Promise(resolve => {
      PrimaryModal.show(PrimaryModal.type.CONFIRM, {
        primaryAction: {
          action: async () => {
            await this.connectionRepository.cancelRequest(userEntity, hideConversation, nextConversationEntity);
            resolve();
          },
          text: t('modalConnectCancelAction'),
        },
        secondaryAction: {
          text: t('modalConnectCancelSecondary'),
        },
        text: {
          message: t('modalConnectCancelMessage', userEntity.name()),
          title: t('modalConnectCancelHeadline'),
        },
      });
    });
  };

  readonly clearConversation = (conversationEntity: Conversation): void => {
    if (conversationEntity) {
      const modalType = conversationEntity.isLeavable() ? PrimaryModal.type.OPTION : PrimaryModal.type.CONFIRM;

      PrimaryModal.show(modalType, {
        primaryAction: {
          action: (leaveConversation = false) => {
            this.conversationRepository.clearConversation(conversationEntity, leaveConversation);
          },
          text: t('modalConversationClearAction'),
        },
        text: {
          message: t('modalConversationClearMessage'),
          option: t('modalConversationClearOption'),
          title: t('modalConversationClearHeadline'),
        },
      });
    }
  };

  readonly deleteClient = (clientEntity: ClientEntity) => {
    const isSSO = this.userState.self().isNoPasswordSSO;
    const isTemporary = clientEntity.isTemporary();
    if (isSSO || isTemporary) {
      // Temporary clients and clients of SSO users don't require a password to be removed
      return this.clientRepository.deleteClient(clientEntity.id, undefined);
    }

    return new Promise<void>(resolve => {
      const expectedErrors = {
        [BackendClientError.LABEL.BAD_REQUEST]: t('BackendError.LABEL.BAD_REQUEST'),
        [BackendClientError.LABEL.INVALID_CREDENTIALS]: t('BackendError.LABEL.INVALID_CREDENTIALS'),
      };
      let isSending = false;
      PrimaryModal.show(
        PrimaryModal.type.PASSWORD,
        {
          closeOnConfirm: false,
          preventClose: true,
          primaryAction: {
            action: async (password: string) => {
              if (!isSending) {
                isSending = true;
                try {
                  await this.clientRepository.deleteClient(clientEntity.id, password);
                  removeCurrentModal();
                  resolve();
                } catch (error) {
                  if (isBackendError(error)) {
                    const {updateErrorMessage} = usePrimaryModalState.getState();
                    updateErrorMessage(expectedErrors[error.label] || error.message);
                  }
                } finally {
                  isSending = false;
                }
              }
            },
            text: t('modalAccountRemoveDeviceAction'),
          },
          text: {
            closeBtnLabel: t('modalRemoveDeviceCloseBtn', clientEntity.model),
            input: t('modalAccountRemoveDevicePlaceholder'),
            message: t('modalAccountRemoveDeviceMessage'),
            title: t('modalAccountRemoveDeviceHeadline', clientEntity.model),
          },
        },
        undefined,
      );
    });
  };

  readonly deleteMessage = (conversationEntity: Conversation, messageEntity: Message): Promise<void> => {
    if (conversationEntity && messageEntity) {
      return new Promise(resolve => {
        PrimaryModal.show(PrimaryModal.type.CONFIRM, {
          primaryAction: {
            action: async () => {
              await this.messageRepository.deleteMessage(conversationEntity, messageEntity);
              resolve();
            },
            text: t('modalConversationDeleteMessageAction'),
          },
          text: {
            closeBtnLabel: t('modalConversationDeleteMessageCloseBtn'),
            message: t('modalConversationDeleteMessageMessage'),
            title: t('modalConversationDeleteMessageHeadline'),
          },
        });
      });
    }

    return Promise.reject();
  };

  readonly deleteMessageEveryone = (conversationEntity: Conversation, messageEntity: Message): Promise<void> => {
    if (conversationEntity && messageEntity) {
      return new Promise(resolve => {
        PrimaryModal.show(PrimaryModal.type.CONFIRM, {
          primaryAction: {
            action: async () => {
              await this.messageRepository.deleteMessageForEveryone(conversationEntity, messageEntity);
              resolve();
            },
            text: t('modalConversationDeleteMessageEveryoneAction'),
          },
          text: {
            closeBtnLabel: t('modalConversationDeleteMessageAllCloseBtn'),
            message: t('modalConversationDeleteMessageEveryoneMessage'),
            title: t('modalConversationDeleteMessageEveryoneHeadline'),
          },
        });
      });
    }

    return Promise.reject();
  };

  readonly ignoreConnectionRequest = (userEntity: User): Promise<void> => {
    if (!userEntity) {
      return Promise.reject();
    }
    return this.connectionRepository.ignoreRequest(userEntity);
  };

  readonly leaveConversation = (conversationEntity: Conversation): Promise<void> => {
    if (!conversationEntity) {
      return Promise.reject();
    }

    return new Promise(resolve => {
      PrimaryModal.show(PrimaryModal.type.OPTION, {
        primaryAction: {
          action: async (clearContent = false) => {
            await this.conversationRepository.removeMember(
              conversationEntity,
              this.userState.self().qualifiedId,
              clearContent,
            );

            resolve();
          },
          text: t('modalConversationLeaveAction'),
        },
        text: {
          closeBtnLabel: t('modalConversationLeaveMessageCloseBtn', conversationEntity.display_name()),
          message: t('modalConversationLeaveMessage'),
          option: t('modalConversationLeaveOption'),
          title: t('modalConversationLeaveHeadline', conversationEntity.display_name()),
        },
      });
    });
  };

  readonly deleteConversation = (conversationEntity: Conversation): Promise<void> => {
    if (conversationEntity && conversationEntity.isCreatedBySelf()) {
      return new Promise(() => {
        PrimaryModal.show(PrimaryModal.type.CONFIRM, {
          primaryAction: {
            action: () => this.conversationRepository.deleteConversation(conversationEntity),
            text: t('modalConversationDeleteGroupAction'),
          },
          text: {
            message: t('modalConversationDeleteGroupMessage'),
            title: t('modalConversationDeleteGroupHeadline', conversationEntity.display_name()),
          },
        });
      });
    }

    return Promise.reject();
  };

  saveConversation = async (conversation: Conversation): Promise<Conversation> => {
    return this.conversationRepository.saveConversation(conversation);
  };

  getOrCreate1to1Conversation = async (userEntity: User): Promise<Conversation> => {
    const conversationEntity = await this.conversationRepository.get1To1Conversation(userEntity);
    if (conversationEntity) {
      return conversationEntity;
    }
    throw new Error(`Cannot find or create 1:1 conversation with user ID "${userEntity.id}".`);
  };

  open1to1Conversation = (conversationEntity: Conversation): Promise<void> => {
    return this.openConversation(conversationEntity);
  };

  readonly open1to1ConversationWithService = async (serviceEntity: ServiceEntity): Promise<void> => {
    if (!serviceEntity) {
      throw new Error();
    }
    const conversationEntity = await this.integrationRepository.get1To1ConversationWithService(serviceEntity);
    return this.openConversation(conversationEntity);
  };

  readonly openGroupConversation = async (conversationEntity?: Conversation): Promise<void> => {
    if (!conversationEntity) {
      throw new Error();
    }
    return this.openConversation(conversationEntity);
  };

  private readonly openConversation = async (conversationEntity: Conversation): Promise<void> => {
    if (conversationEntity.is_archived()) {
      await this.conversationRepository.unarchiveConversation(conversationEntity, true);
    }

    if (conversationEntity.is_cleared()) {
      conversationEntity.cleared_timestamp(0);
    }

    amplify.publish(WebAppEvents.CONVERSATION.SHOW, conversationEntity, {});
  };

  removeFromConversation = async (conversationEntity: Conversation, userEntity: User): Promise<void> => {
    if (conversationEntity && userEntity) {
      if (userEntity.isService) {
        await this.integrationRepository.removeService(conversationEntity, userEntity);
        return;
      }

      return new Promise((resolve, reject) => {
        PrimaryModal.show(PrimaryModal.type.CONFIRM, {
          primaryAction: {
            action: async () => {
              try {
                await this.conversationRepository.removeMember(conversationEntity, userEntity.qualifiedId);
                resolve();
              } catch (error) {
                reject(error);
              }
            },
            text: t('modalConversationRemoveAction'),
          },
          text: {
            closeBtnLabel: t('modalConversationRemoveCloseBtn'),
            message: t('modalConversationRemoveMessage', userEntity.name()),
            title: t('modalConversationRemoveHeadline'),
          },
        });
      });
    }

    throw new Error(`Unable to remove user '${userEntity?.id}' from conversation '${conversationEntity?.id}'`);
  };

  /**
   * @param userEntity User to connect to
   * @returns Promise that resolves to true if the request was successfully sent, false if not
   */
  readonly sendConnectionRequest = (userEntity: User): Promise<boolean> => {
    return this.connectionRepository.createConnection(userEntity);
  };

  readonly toggleMuteConversation = async (conversationEntity: Conversation): Promise<void> => {
    if (conversationEntity) {
      const notificationState = conversationEntity.showNotificationsEverything()
        ? NOTIFICATION_STATE.NOTHING
        : NOTIFICATION_STATE.EVERYTHING;
      await this.conversationRepository.setNotificationState(conversationEntity, notificationState);
    }
  };

  /**
   * @param userEntity User to unblock
   * @returns Resolves when the user was unblocked
   */
  readonly unblockUser = (userEntity: User): Promise<void> => {
    return new Promise(resolve => {
      PrimaryModal.show(PrimaryModal.type.CONFIRM, {
        primaryAction: {
          action: async () => {
            await this.connectionRepository.unblockUser(userEntity);
            const conversationEntity = await this.conversationRepository.get1To1Conversation(userEntity);
            resolve();
            if (typeof conversationEntity !== 'boolean') {
              await this.conversationRepository.updateParticipatingUserEntities(conversationEntity);
            }
          },
          text: t('modalUserUnblockAction'),
        },
        text: {
          message: t('modalUserUnblockMessage', userEntity.name()),
          title: t('modalUserUnblockHeadline'),
        },
      });
    });
  };
}
