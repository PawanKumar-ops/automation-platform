import { useLocalSearchParams } from 'expo-router';
import { WorkflowCanvas } from '@/components/workflow-canvas';

export default function CanvasScreen() {
    const { showGmailConnection, workflowId } = useLocalSearchParams<{ showGmailConnection?: string | string[]; workflowId?: string | string[] }>();
    const id = Array.isArray(workflowId) ? workflowId[0] : workflowId;
    const openGmailConnection = Array.isArray(showGmailConnection) ? showGmailConnection[0] === '1' : showGmailConnection === '1';
    return <WorkflowCanvas key={id ?? 'new'} showGmailConnection={openGmailConnection} workflowId={id} />;
}
