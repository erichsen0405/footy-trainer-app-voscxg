
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useTeamPlayer } from '@/contexts/TeamPlayerContext';

export default function TeamPlayerSelector() {
  const {
    teams,
    players,
    selectedContext,
    setSelectedContext,
    loading,
  } = useTeamPlayer();

  const [showModal, setShowModal] = useState(false);

  const handleSelectPlayer = async (playerId: string, playerName: string) => {
    await setSelectedContext({
      type: 'player',
      id: playerId,
      name: playerName,
    });
    setShowModal(false);
  };

  const handleSelectTeam = async (teamId: string, teamName: string) => {
    await setSelectedContext({
      type: 'team',
      id: teamId,
      name: teamName,
    });
    setShowModal(false);
  };

  const getDisplayText = () => {
    if (!selectedContext.type || !selectedContext.name) {
      return 'Vælg spiller eller team';
    }
    return selectedContext.name;
  };

  const getIcon = () => {
    if (!selectedContext.type) {
      return {
        ios: 'person.crop.circle.badge.questionmark',
        android: 'help',
      };
    }
    if (selectedContext.type === 'player') {
      return {
        ios: 'person.fill',
        android: 'person',
      };
    }
    return {
      ios: 'person.3.fill',
      android: 'groups',
    };
  };

  const icon = getIcon();

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[
          styles.selectorButton,
          !selectedContext.type && styles.selectorButtonEmpty,
        ]}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <View style={styles.selectorContent}>
          <View style={[
            styles.iconCircle,
            { backgroundColor: selectedContext.type ? colors.primary : colors.textSecondary },
          ]}>
            <IconSymbol
              ios_icon_name={icon.ios}
              android_material_icon_name={icon.android}
              size={24}
              color="#fff"
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.label}>Administrer for:</Text>
            <Text style={[
              styles.selectedText,
              !selectedContext.type && styles.placeholderText,
            ]}>
              {getDisplayText()}
            </Text>
          </View>
        </View>
        <IconSymbol
          ios_icon_name="chevron.down"
          android_material_icon_name="expand_more"
          size={20}
          color={colors.textSecondary}
        />
      </TouchableOpacity>

      {!selectedContext.type && (
        <View style={styles.warningBox}>
          <IconSymbol
            ios_icon_name="exclamationmark.triangle.fill"
            android_material_icon_name="warning"
            size={20}
            color={colors.warning}
          />
          <Text style={styles.warningText}>
            Vælg en spiller eller et team for at administrere aktiviteter
          </Text>
        </View>
      )}

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Vælg spiller eller team</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            {/* Players Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Spillere ({players.length})</Text>
              {players.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Ingen spillere tilgængelige</Text>
                </View>
              ) : (
                players.map((player) => (
                  <TouchableOpacity
                    key={player.id}
                    style={[
                      styles.optionCard,
                      selectedContext.type === 'player' &&
                        selectedContext.id === player.id &&
                        styles.selectedCard,
                    ]}
                    onPress={() => handleSelectPlayer(player.id, player.full_name)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionIcon}>
                      <IconSymbol
                        ios_icon_name="person.fill"
                        android_material_icon_name="person"
                        size={28}
                        color={
                          selectedContext.type === 'player' &&
                          selectedContext.id === player.id
                            ? colors.primary
                            : colors.textSecondary
                        }
                      />
                    </View>
                    <View style={styles.optionInfo}>
                      <Text style={styles.optionName}>{player.full_name}</Text>
                      {player.phone_number && (
                        <Text style={styles.optionDetail}>{player.phone_number}</Text>
                      )}
                    </View>
                    {selectedContext.type === 'player' &&
                      selectedContext.id === player.id && (
                        <IconSymbol
                          ios_icon_name="checkmark.circle.fill"
                          android_material_icon_name="check_circle"
                          size={24}
                          color={colors.primary}
                        />
                      )}
                  </TouchableOpacity>
                ))
              )}
            </View>

            {/* Teams Section */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Teams ({teams.length})</Text>
              {teams.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Ingen teams tilgængelige</Text>
                </View>
              ) : (
                teams.map((team) => (
                  <TouchableOpacity
                    key={team.id}
                    style={[
                      styles.optionCard,
                      selectedContext.type === 'team' &&
                        selectedContext.id === team.id &&
                        styles.selectedCard,
                    ]}
                    onPress={() => handleSelectTeam(team.id, team.name)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionIcon}>
                      <IconSymbol
                        ios_icon_name="person.3.fill"
                        android_material_icon_name="groups"
                        size={28}
                        color={
                          selectedContext.type === 'team' &&
                          selectedContext.id === team.id
                            ? colors.primary
                            : colors.textSecondary
                        }
                      />
                    </View>
                    <View style={styles.optionInfo}>
                      <Text style={styles.optionName}>{team.name}</Text>
                      {team.description && (
                        <Text style={styles.optionDetail}>{team.description}</Text>
                      )}
                    </View>
                    {selectedContext.type === 'team' &&
                      selectedContext.id === team.id && (
                        <IconSymbol
                          ios_icon_name="checkmark.circle.fill"
                          android_material_icon_name="check_circle"
                          size={24}
                          color={colors.primary}
                        />
                      )}
                  </TouchableOpacity>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  selectorButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  selectorButtonEmpty: {
    borderColor: colors.warning,
    borderStyle: 'dashed',
  },
  selectorContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  selectedText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  placeholderText: {
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  warningBox: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    marginTop: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: colors.warning,
    lineHeight: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.highlight,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectedCard: {
    borderColor: colors.primary,
    backgroundColor: colors.highlight,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionInfo: {
    flex: 1,
    gap: 4,
  },
  optionName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  optionDetail: {
    fontSize: 14,
    color: colors.textSecondary,
  },
});
