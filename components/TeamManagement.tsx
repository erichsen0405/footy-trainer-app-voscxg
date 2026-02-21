
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { IconSymbol } from '@/components/IconSymbol';
import { colors } from '@/styles/commonStyles';
import { useTeamPlayer, Team, Player } from '@/contexts/TeamPlayerContext';

export default function TeamManagement() {
  const {
    teams,
    players,
    loading,
    createTeam,
    updateTeam,
    deleteTeam,
    addPlayerToTeam,
    removePlayerFromTeam,
    getTeamMembers,
    refreshTeams,
  } = useTeamPlayer();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [teamMembers, setTeamMembers] = useState<Player[]>([]);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      Alert.alert('Fejl', 'Indtast venligst et teamnavn');
      return;
    }

    setProcessing(true);
    try {
      await createTeam(teamName, teamDescription);
      Alert.alert('Succes', 'Team oprettet');
      setShowCreateModal(false);
      setTeamName('');
      setTeamDescription('');
    } catch (error: any) {
      console.error('Error creating team:', error);
      Alert.alert('Fejl', 'Kunne ikke oprette team: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateTeam = async () => {
    if (!selectedTeam || !teamName.trim()) {
      Alert.alert('Fejl', 'Indtast venligst et teamnavn');
      return;
    }

    setProcessing(true);
    try {
      await updateTeam(selectedTeam.id, teamName, teamDescription);
      Alert.alert('Succes', 'Team opdateret');
      setShowEditModal(false);
      setSelectedTeam(null);
      setTeamName('');
      setTeamDescription('');
    } catch (error: any) {
      console.error('Error updating team:', error);
      Alert.alert('Fejl', 'Kunne ikke opdatere team: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteTeam = (team: Team) => {
    Alert.alert(
      'Slet team',
      `Er du sikker på at du vil slette "${team.name}"?\n\nDette vil ikke slette spillerne, men alle aktiviteter og data tilknyttet teamet vil blive slettet.`,
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Slet',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              await deleteTeam(team.id);
              Alert.alert('Succes', 'Team slettet');
            } catch (error: any) {
              console.error('Error deleting team:', error);
              Alert.alert('Fejl', 'Kunne ikke slette team: ' + error.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const handleShowMembers = async (team: Team) => {
    setSelectedTeam(team);
    setProcessing(true);
    try {
      const members = await getTeamMembers(team.id);
      setTeamMembers(members);
      setShowMembersModal(true);
    } catch (error: any) {
      console.error('Error fetching team members:', error);
      Alert.alert('Fejl', 'Kunne ikke hente teammedlemmer: ' + error.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleAddPlayerToTeam = async (playerId: string) => {
    if (!selectedTeam) return;

    setProcessing(true);
    try {
      await addPlayerToTeam(selectedTeam.id, playerId);
      const members = await getTeamMembers(selectedTeam.id);
      setTeamMembers(members);
      Alert.alert('Succes', 'Spiller tilføjet til team');
    } catch (error: any) {
      console.error('Error adding player to team:', error);
      if (error.message.includes('duplicate')) {
        Alert.alert('Fejl', 'Spilleren er allerede medlem af dette team');
      } else {
        Alert.alert('Fejl', 'Kunne ikke tilføje spiller: ' + error.message);
      }
    } finally {
      setProcessing(false);
    }
  };

  const handleRemovePlayerFromTeam = async (playerId: string) => {
    if (!selectedTeam) return;

    Alert.alert(
      'Fjern spiller',
      'Er du sikker på at du vil fjerne denne spiller fra teamet?',
      [
        { text: 'Annuller', style: 'cancel' },
        {
          text: 'Fjern',
          style: 'destructive',
          onPress: async () => {
            setProcessing(true);
            try {
              await removePlayerFromTeam(selectedTeam.id, playerId);
              const members = await getTeamMembers(selectedTeam.id);
              setTeamMembers(members);
              Alert.alert('Succes', 'Spiller fjernet fra team');
            } catch (error: any) {
              console.error('Error removing player from team:', error);
              Alert.alert('Fejl', 'Kunne ikke fjerne spiller: ' + error.message);
            } finally {
              setProcessing(false);
            }
          },
        },
      ]
    );
  };

  const openEditModal = (team: Team) => {
    setSelectedTeam(team);
    setTeamName(team.name);
    setTeamDescription(team.description || '');
    setShowEditModal(true);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Indlæser teams...</Text>
      </View>
    );
  }

  const availablePlayers = players.filter(
    player => !teamMembers.some(member => member.id === player.id)
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>Teams ({teams.length})</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.primary }]}
          onPress={() => setShowCreateModal(true)}
          activeOpacity={0.7}
          testID="team.createButton"
        >
          <IconSymbol
            ios_icon_name="plus"
            android_material_icon_name="add"
            size={20}
            color="#fff"
          />
          <Text style={styles.addButtonText}>Opret team</Text>
        </TouchableOpacity>
      </View>

      {teams.length === 0 ? (
        <View style={styles.emptyState}>
          <IconSymbol
            ios_icon_name="person.3"
            android_material_icon_name="groups"
            size={64}
            color={colors.textSecondary}
          />
          <Text style={styles.emptyTitle}>Ingen teams endnu</Text>
          <Text style={styles.emptyText}>
            Opret et team for at organisere dine spillere
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.teamsList} showsVerticalScrollIndicator={false}>
          {teams.map((team) => (
            <View key={team.id} style={styles.teamCard} testID={`team.card.${team.id}`}>
              <View style={styles.teamIcon}>
                <IconSymbol
                  ios_icon_name="person.3.fill"
                  android_material_icon_name="groups"
                  size={32}
                  color={colors.primary}
                />
              </View>
              <View style={styles.teamInfo}>
                <Text style={styles.teamName} testID={`team.card.name.${team.id}`}>{team.name}</Text>
                {team.description && (
                  <Text style={styles.teamDescription}>{team.description}</Text>
                )}
              </View>
              <View style={styles.teamActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleShowMembers(team)}
                  disabled={processing}
                >
                  <IconSymbol
                    ios_icon_name="person.2"
                    android_material_icon_name="group"
                    size={20}
                    color={colors.primary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => openEditModal(team)}
                  disabled={processing}
                >
                  <IconSymbol
                    ios_icon_name="pencil"
                    android_material_icon_name="edit"
                    size={20}
                    color={colors.secondary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleDeleteTeam(team)}
                  disabled={processing}
                  testID={`team.card.deleteButton.${team.id}`}
                >
                  <IconSymbol
                    ios_icon_name="trash"
                    android_material_icon_name="delete"
                    size={20}
                    color={colors.error}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Create Team Modal */}
      <Modal
        visible={showCreateModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>
            <Text style={styles.modalTitle} testID="team.create.modalTitle">Opret team</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.label}>Teamnavn *</Text>
            <TextInput
              style={styles.input}
              value={teamName}
              onChangeText={setTeamName}
              placeholder="F.eks. U15 Drenge"
              placeholderTextColor={colors.textSecondary}
              editable={!processing}
              testID="team.create.nameInput"
            />

            <Text style={styles.label}>Beskrivelse</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={teamDescription}
              onChangeText={setTeamDescription}
              placeholder="Valgfri beskrivelse af teamet"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              editable={!processing}
              testID="team.create.descriptionInput"
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowCreateModal(false)}
              disabled={processing}
            >
              <Text style={styles.cancelButtonText}>Annuller</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={handleCreateTeam}
              disabled={processing}
              testID="team.create.submitButton"
            >
              {processing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Opret</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Edit Team Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Rediger team</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.label}>Teamnavn *</Text>
            <TextInput
              style={styles.input}
              value={teamName}
              onChangeText={setTeamName}
              placeholder="F.eks. U15 Drenge"
              placeholderTextColor={colors.textSecondary}
              editable={!processing}
            />

            <Text style={styles.label}>Beskrivelse</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={teamDescription}
              onChangeText={setTeamDescription}
              placeholder="Valgfri beskrivelse af teamet"
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={4}
              editable={!processing}
            />
          </ScrollView>

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowEditModal(false)}
              disabled={processing}
            >
              <Text style={styles.cancelButtonText}>Annuller</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={handleUpdateTeam}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Gem</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Team Members Modal */}
      <Modal
        visible={showMembersModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowMembersModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowMembersModal(false)}>
              <IconSymbol
                ios_icon_name="xmark"
                android_material_icon_name="close"
                size={24}
                color={colors.text}
              />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{selectedTeam?.name}</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.sectionTitle}>Medlemmer ({teamMembers.length})</Text>
            {teamMembers.length === 0 ? (
              <View style={styles.emptyMembers}>
                <Text style={styles.emptyMembersText}>Ingen medlemmer endnu</Text>
              </View>
            ) : (
              teamMembers.map((member) => (
                <View key={member.id} style={styles.memberCard}>
                  <View style={styles.memberIcon}>
                    <IconSymbol
                      ios_icon_name="person.fill"
                      android_material_icon_name="person"
                      size={24}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{member.full_name}</Text>
                    {member.phone_number && (
                      <Text style={styles.memberPhone}>{member.phone_number}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemovePlayerFromTeam(member.id)}
                    disabled={processing}
                  >
                    <IconSymbol
                      ios_icon_name="minus.circle"
                      android_material_icon_name="remove_circle"
                      size={24}
                      color={colors.error}
                    />
                  </TouchableOpacity>
                </View>
              ))
            )}

            <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
              Tilføj spillere ({availablePlayers.length})
            </Text>
            {availablePlayers.length === 0 ? (
              <View style={styles.emptyMembers}>
                <Text style={styles.emptyMembersText}>
                  Alle spillere er allerede medlemmer
                </Text>
              </View>
            ) : (
              availablePlayers.map((player) => (
                <View key={player.id} style={styles.memberCard}>
                  <View style={styles.memberIcon}>
                    <IconSymbol
                      ios_icon_name="person"
                      android_material_icon_name="person_outline"
                      size={24}
                      color={colors.textSecondary}
                    />
                  </View>
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>{player.full_name}</Text>
                    {player.phone_number && (
                      <Text style={styles.memberPhone}>{player.phone_number}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.addMemberButton}
                    onPress={() => handleAddPlayerToTeam(player.id)}
                    disabled={processing}
                  >
                    <IconSymbol
                      ios_icon_name="plus.circle"
                      android_material_icon_name="add_circle"
                      size={24}
                      color={colors.primary}
                    />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    minHeight: 200,
  },
  loadingText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    minHeight: 200,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  teamsList: {
    flex: 1,
  },
  teamCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    gap: 16,
  },
  teamIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamInfo: {
    flex: 1,
    gap: 4,
  },
  teamName: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  teamDescription: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  teamActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: colors.highlight,
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
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.highlight,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    borderTopWidth: 1,
    borderTopColor: colors.highlight,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: colors.highlight,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  memberIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.highlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberInfo: {
    flex: 1,
    gap: 4,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  memberPhone: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  removeButton: {
    padding: 8,
  },
  addMemberButton: {
    padding: 8,
  },
  emptyMembers: {
    padding: 24,
    alignItems: 'center',
  },
  emptyMembersText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
